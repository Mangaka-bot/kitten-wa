import { pluginManager } from '#plugins.js';
import { logger } from '#internals.js';
import { initSession, listSessions } from '#auth.js';
import {
  ConnectionState,
  DEFAULT_MAX_RETRIES,
  defaultBackoff,
  silentLogger,
  silentPino,
} from './constants.js';
import { ConnectionError, parseDisconnectReason } from './errors.js';
import { ClientRegistry } from './registry.js';
import { createSocketProxy } from './socket-proxy.js';
import { createPersistentEventBus } from './event-bus.js';
import { handleClientAuth } from './auth-handler.js';
import { syncOtherSessions } from './sync-manager.js';

export { ConnectionState, ConnectionError };

export class Client {
  // Static Registry API

  static get(id) {
    return ClientRegistry.get(id);
  }

  static has(id) {
    return ClientRegistry.has(id);
  }

  static get size() {
    return ClientRegistry.size;
  }

  static keys() {
    return ClientRegistry.keys();
  }

  static values() {
    return ClientRegistry.values();
  }

  static entries() {
    return ClientRegistry.entries();
  }

  static [Symbol.iterator]() {
    return ClientRegistry.values();
  }

  // Instance Properties

  sock = null;
  session = null;
  id = null;

  #rawSock = null;
  #ev = null;
  #sockProxy = null;

  #flag = '';
  #plugins = null;
  #qr = null;
  #state = ConnectionState.DISCONNECTED;
  #cancelWait = null;
  #hasConnectedOnce = false;
  #hasEverConnected = false;
  #isFirstConnection = false;
  #isNewSession = null;

  #socketConfig = null;
  #authConfig = null;
  #pairingCodeRequested = false;

  #reconnectAttempts = 0;
  #reconnectTimer = null;
  #isShuttingDown = false;

  #pendingConnect = null;

  #maxRetries;
  #backoff;

  // Options
  #silent;
  #sync;
  #logger;

  // Callbacks
  #onPairing;
  #onConnect;
  #onReconnect;
  #onDisconnect;
  #onStateChange;

  constructor(options = {}) {
    const {
      id,
      maxRetries = DEFAULT_MAX_RETRIES,
      backoff = defaultBackoff,
      silent = false,
      sync = false,
      onPairing = null,
      onConnect = null,
      onReconnect = null,
      onDisconnect = null,
      onStateChange = null,
      socketConfig = {},
    } = options;

    this.id = id;
    this.#socketConfig = socketConfig;
    this.#maxRetries = maxRetries;
    this.#backoff = backoff;
    this.#silent = silent;
    this.#sync = sync;
    this.#logger = silent ? silentLogger : logger;
    this.#onPairing = onPairing;
    this.#onConnect = onConnect;
    this.#onReconnect = onReconnect;
    this.#onDisconnect = onDisconnect;
    this.#onStateChange = onStateChange;

    this.#ev = createPersistentEventBus();
    this.#sockProxy = createSocketProxy(
      () => this.#rawSock,
      () => this.#ev
    );
    this.sock = this.#sockProxy;
  }

  get state() {
    return this.#state;
  }

  get isConnected() {
    return this.#state === ConnectionState.CONNECTED;
  }

  get isFirstConnection() {
    return this.#isFirstConnection;
  }

  get reconnectAttempts() {
    return this.#reconnectAttempts;
  }

  get ev() {
    return this.#ev;
  }

  get rawSocket() {
    return this.#rawSock;
  }

  // Registry Management

  #register() {
    if (this.id != null) {
      ClientRegistry.set(this.id, this);
    }
  }

  #unregister() {
    if (this.id != null) {
      ClientRegistry.delete(this.id);
    }
  }

  // State Management

  #setState(newState) {
    const oldState = this.#state;
    if (oldState === newState) return;

    this.#state = newState;
    this.#emit('stateChange', { oldState, newState });
  }

  #emit(event, data = {}) {
    const callbacks = {
      connect: this.#onConnect,
      reconnect: this.#onReconnect,
      disconnect: this.#onDisconnect,
      stateChange: this.#onStateChange,
    };

    const callback = callbacks[event];
    if (typeof callback !== 'function') return;

    queueMicrotask(() => {
      try {
        callback({ ...data, client: this });
      } catch (err) {
        this.#logger.error(err, `[${this.#flag}] Error in ${event} callback`);
      }
    });
  }

  // Connection Management

  async connect() {
    if (this.#isShuttingDown) {
      throw new Error(`[${this.#flag}] Client is shutting down`);
    }

    if (this.#state === ConnectionState.CONNECTED) {
      return { sock: this.sock, session: this.session, id: this.id };
    }

    if (this.#pendingConnect) {
      return this.#pendingConnect.promise;
    }

    return this.#initConnection();
  }

  async #initConnection() {
    this.#setState(ConnectionState.CONNECTING);
    this.#reconnectAttempts = 0;
    this.#pendingConnect = this.#createDeferred();

    try {
      await this.#createSocket();
    } catch (err) {
      this.#setState(ConnectionState.DISCONNECTED);
      this.#resolvePending(null, err);
    }

    return this.#pendingConnect.promise;
  }

  #createDeferred() {
    let resolve, reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  #resolvePending(value, error = null) {
    if (!this.#pendingConnect) return;

    const { resolve, reject } = this.#pendingConnect;
    this.#pendingConnect = null;

    if (error) {
      reject(error);
    } else {
      resolve(value);
    }
  }

  async #createSocket() {
    this.#cleanupSocket();

    let targetId = this.id;
    if (targetId == null) {
      const existingSessions = listSessions();
      const available = existingSessions.find((id) => !ClientRegistry.has(id));
      if (available != null) {
        targetId = available;
      }
    }

    const socketConfig = this.#silent
      ? { ...this.#socketConfig, logger: silentPino }
      : this.#socketConfig;

    const { sock, session } = await initSession({
      socketConfig,
      id: targetId,
    });

    this.#rawSock = sock;
    this.session = session;
    this.id = session.id;
    this.#flag = `CLIENT-${session.id}`;

    if (this.#isNewSession === null) {
      this.#isNewSession = Boolean(session.isNew);
    }

    // Pipe all events from the active raw socket into the persistent event bus
    this.#rawSock.ev.process(async (events) => {
      for (const [event, data] of Object.entries(events)) {
        this.#ev.emit(event, data);
      }
    });

    this.#rawSock.ev.on('connection.update', (update) => {
      this.#handleConnectionUpdate(update);
    });
  }

  async #handleConnectionUpdate({ connection, lastDisconnect, qr }) {
    if (this.#isShuttingDown) return;

    try {
      if (qr) {
        this.#qr = qr;
        await handleClientAuth({
          qr: this.#qr,
          rawSock: this.#rawSock,
          flag: this.#flag,
          isSync: this.#sync,
          isSilent: this.#silent,
          onPairing: this.#onPairing,
          logger: this.#logger,
          authConfig: this.#authConfig,
          setAuthConfig: (cfg) => {
            this.#authConfig = cfg;
          },
          pairingCodeRequested: this.#pairingCodeRequested,
          setPairingCodeRequested: (req) => {
            this.#pairingCodeRequested = req;
          },
          onSyncAuthAbort: (err) => {
            this.#cleanupSocket();
            this.#setState(ConnectionState.DISCONNECTED);
            this.#resolvePending(null, err);
          },
        });
      }

      if (connection === 'open') {
        await this.#onConnectionOpen();
      } else if (connection === 'close') {
        await this.#onConnectionClose(lastDisconnect);
      }
    } catch (err) {
      this.#logger.error(err, `[${this.#flag}] Error in connection update handler`);
      this.#resolvePending(null, err);
    }
  }

  async #onConnectionOpen() {
    const wasReconnecting = this.#state === ConnectionState.RECONNECTING;
    this.#setState(ConnectionState.CONNECTED);

    this.#register();
    this.#pairingCodeRequested = false;

    if (!this.#plugins || this.#plugins.destroyed) {
      try {
        this.#plugins = await pluginManager(this.sock);
      } catch (err) {
        this.#logger.error(err, `[${this.#flag}] Failed to initialize plugins`);
      }
    }

    const attempts = this.#reconnectAttempts;
    this.#reconnectAttempts = 0;

    const isFirstConnection = Boolean(this.#isNewSession && !this.#hasEverConnected);
    this.#isFirstConnection = isFirstConnection;

    if (wasReconnecting) {
      this.#isFirstConnection = false;
      this.#emit('reconnect', { attempts });
      this.#logger.debug(`[${this.#flag}] Reconnected after ${attempts} attempt(s)`);
    } else {
      this.#hasConnectedOnce = true;
      this.#emit('connect', { isFirstConnection });
      this.#hasEverConnected = true;
      this.#isNewSession = false;
      this.#logger.debug(`[${this.#flag}] Connected successfully`);
      this.#resolvePending({ sock: this.sock, session: this.session, id: this.id });

      if (!this.#sync) {
        syncOtherSessions({
          currentId: this.id,
          flag: this.#flag,
          logger: this.#logger,
          ClientClass: Client,
        });
      }
    }
  }

  async #onConnectionClose(lastDisconnect) {
    const disconnectInfo = parseDisconnectReason(lastDisconnect);
    const { message, statusCode, recoverable, deleteSession, isRestart } = disconnectInfo;

    const level = recoverable ? 'debug' : 'warn';
    this.#logger[level](`[${this.#flag}] Disconnected: ${message} (code: ${statusCode})`);

    if (this.#hasConnectedOnce && !isRestart) {
      this.#emit('disconnect', { message, statusCode, recoverable });
    }

    this.#unregister();

    if (deleteSession) {
      await this.session?.delete().catch((err) => {
        this.#logger.error(err, `[${this.#flag}] Failed to delete session`);
      });
      this.#authConfig = null;
      this.#pairingCodeRequested = false;
      this.#isNewSession = true;
      this.#hasEverConnected = false;
      this.#isFirstConnection = false;
      this.#hasConnectedOnce = false;
    }

    // If session was deleted, invalid, or logged out, and client is not a background sync connection
    if (deleteSession && !this.#sync) {
      this.#logger.warn(`[${this.#flag}] Session invalid or deleted, initiating new connection dialogue`);
      this.id = null; // Reset so that a fresh clean session can be allocated
      await this.#scheduleReconnect('Session reset for re-authentication');
      return;
    }

    if (!recoverable || this.#isShuttingDown) {
      this.#setState(ConnectionState.DISCONNECTED);
      this.#resolvePending(null, new ConnectionError(message, { statusCode, recoverable }));
      return;
    }

    if (isRestart) {
      this.#logger.debug(`[${this.#flag}] restarting session`);
      try {
        await this.#createSocket();
      } catch (err) {
        this.#logger.error(err, `[${this.#flag}] Socket creation failed during restart`);
        await this.#scheduleReconnect(err.message);
      }
      return;
    }

    await this.#scheduleReconnect(message);
  }

  // Reconnection Logic

  async #scheduleReconnect(reason) {
    this.#reconnectAttempts++;

    if (this.#reconnectAttempts > this.#maxRetries) {
      const err = new ConnectionError(
        `Max reconnection attempts (${this.#maxRetries}) exceeded`,
        { recoverable: false }
      );
      this.#setState(ConnectionState.DISCONNECTED);
      this.#resolvePending(null, err);
      this.#logger.error(err, `[${this.#flag}] ${err.message}`);
      return;
    }

    if (this.#hasConnectedOnce) {
      this.#setState(ConnectionState.RECONNECTING);
    }

    const delay = this.#backoff(this.#reconnectAttempts);
    const retriesInfo =
      this.#maxRetries !== Infinity
        ? `(${this.#reconnectAttempts}/${this.#maxRetries})`
        : '';

    this.#logger.debug(`[${this.#flag}] ${reason}. Reconnecting in ${delay}ms`);

    const cancelled = await this.#wait(delay);
    if (cancelled || this.#isShuttingDown) return;

    this.#logger.debug(`[${this.#flag}] Executing reconnect attempt ${retriesInfo}`);

    try {
      await this.#createSocket();
    } catch (err) {
      this.#logger.error(err, `[${this.#flag}] Socket creation failed during reconnect`);
      await this.#scheduleReconnect(err.message);
    }
  }

  #wait(ms) {
    return new Promise((resolve) => {
      this.#reconnectTimer = setTimeout(() => {
        this.#reconnectTimer = null;
        resolve(false);
      }, ms);

      this.#cancelWait = () => resolve(true);
    });
  }

  // Cleanup & Shutdown

  #cleanupSocket() {
    if (this.#plugins && !this.#plugins.destroyed) {
      this.#plugins.destroy();
      this.#plugins = null;
    }

    this.#pairingCodeRequested = false;

    if (!this.#rawSock) return;

    try {
      this.#rawSock.ev.removeAllListeners();
      this.#rawSock.ws?.close?.();
    } catch {
      /* noop */
    }

    this.#rawSock = null;
  }

  #clearReconnectTimer() {
    if (this.#reconnectTimer) {
      clearTimeout(this.#reconnectTimer);
      this.#reconnectTimer = null;
      this.#cancelWait?.();
    }
  }

  async disconnect() {
    if (this.#isShuttingDown) return;
    this.#isShuttingDown = true;

    this.#clearReconnectTimer();
    this.#resolvePending(null, new Error('Client disconnected'));

    // Unregister from registry
    this.#unregister();

    this.#cleanupSocket();
    this.#setState(ConnectionState.DISCONNECTED);

    this.#isShuttingDown = false;
    this.#hasConnectedOnce = false;
    this.#pairingCodeRequested = false;
  }

  async logout() {
    try {
      await this.#rawSock?.logout?.();
      await this.disconnect();
      await this.session?.delete();
      this.#isNewSession = null;
      this.#hasEverConnected = false;
      this.#isFirstConnection = false;
    } catch (err) {
      this.#logger.error(err, `[${this.#flag}] Logging out failed`);
    }
  }
}

export const getClient = async (options) => {
  const client = new Client(options);
  await client.connect();
  return client;
};