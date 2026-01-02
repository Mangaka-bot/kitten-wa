import { DisconnectReason } from "baileys";
import { Boom } from "@hapi/boom";
import qrcode from "qrcode-terminal";
import chalk from "chalk";
import { logger } from "#internals.js";
import { initSession } from "#auth.js";
import { getConnectionConfig } from "./getConnectionConfig.js";

export const ConnectionState = Object.freeze({
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  RECONNECTING: 'reconnecting',
});

class ConnectionError extends Error {
  constructor(message, { statusCode, recoverable = true } = {}) {
    super(message);
    this.name = "ConnectionError";
    this.statusCode = statusCode;
    this.recoverable = recoverable;
  }
}

const DISCONNECT_HANDLERS = new Map([
  [DisconnectReason.connectionClosed, { message: "Connection closed", recoverable: true }],
  [DisconnectReason.restartRequired, { message: "QR Scanned", recoverable: true }],
  [DisconnectReason.timedOut, { message: "Connection timed out", recoverable: true }],
  [DisconnectReason.connectionLost, { message: "Connection lost", recoverable: true }],
  [DisconnectReason.unavailableService, { message: "Service unavailable", recoverable: true }],
  [DisconnectReason.loggedOut, { message: "Session logged out", recoverable: true, deleteSession: true }],
  [DisconnectReason.forbidden, { message: "Account banned", recoverable: false, deleteSession: true }],
  [405, { message: "Not logged in", recoverable: true, deleteSession: true }],
]);

export class Client {
  sock = null;
  session = null;
  id = null;

  #flag = "";
  #qr = null;
  #state = ConnectionState.DISCONNECTED;
  #cancelWait
  #isConfiguring = false;
  #hasConnectedOnce = false;

  #socketConfig = null;
  #authConfig = null;

  #reconnectAttempts = 0;
  #reconnectTimer = null;
  #isShuttingDown = false;

  #pendingConnect = null;

  #maxRetries;
  #backoff;

  #onPairing;
  #onConnect;
  #onReconnect;
  #onDisconnect;
  #onStateChange;

  constructor(options = {}) {
    const {
      id,
      maxRetries = 30,
      backoff = (attempt) => Math.min(1000 * Math.pow(2, attempt - 1), 60_000),
      onPairing = null,
      onConnect = null,
      onReconnect = null,
      onDisconnect = null,
      onStateChange = null,
      socketConfig = {}
    } = options;

    this.id = id;
    this.#socketConfig = socketConfig;
    this.#maxRetries = maxRetries;
    this.#backoff = backoff;
    this.#onPairing = onPairing;
    this.#onConnect = onConnect;
    this.#onReconnect = onReconnect;
    this.#onDisconnect = onDisconnect;
    this.#onStateChange = onStateChange;
  }

  get state() {
    return this.#state;
  }

  get isConnected() {
    return this.#state === ConnectionState.CONNECTED;
  }

  get reconnectAttempts() {
    return this.#reconnectAttempts;
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
        logger.error(err, `[${this.#flag}] Error in ${event} callback`);
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

    const { sock, session } = await initSession({
      socketConfig: this.#socketConfig,
      id: this.id,
    });

    this.sock = sock;
    this.session = session;
    this.id = session.id;
    this.#flag = `CLIENT-${session.id}`;

    this.sock.ev.on("connection.update", (update) => {
      this.#handleConnectionUpdate(update);
    });
  }

  async #handleConnectionUpdate({ connection, lastDisconnect, qr }) {
    if (this.#isShuttingDown) return;

    try {
      if (qr) {
        await this.#handleAuth(qr);
      } else if (connection === "open") {
        this.#onConnectionOpen();
      } else if (connection === "close") {
        await this.#onConnectionClose(lastDisconnect);
      }
    } catch (err) {
      logger.error(err, `[${this.#flag}] Error in connection update handler`);
      this.#resolvePending(null, err);
    }
  }

  #onConnectionOpen() {
    const wasReconnecting = this.#state === ConnectionState.RECONNECTING;
    this.#setState(ConnectionState.CONNECTED);

    const attempts = this.#reconnectAttempts;
    this.#reconnectAttempts = 0;

    if (wasReconnecting) {
      this.#emit('reconnect', { attempts });
      logger.debug(`[${this.#flag}] Reconnected after ${attempts} attempt(s)`);
    } else {
      this.#hasConnectedOnce = true;
      this.#emit('connect');
      logger.debug(`[${this.#flag}] Connected successfully`);
      this.#resolvePending({ sock: this.sock, session: this.session });
    }
  }

  async #onConnectionClose(lastDisconnect) {
    const disconnectInfo = this.#parseDisconnectReason(lastDisconnect);
    const { message, statusCode, recoverable, deleteSession } = disconnectInfo;

    if (message === "QR Scanned" && !this.#onPairing) {
      console.clear();
    }

    const level = recoverable ? 'debug' : 'warn';

    logger[level](`[${this.#flag}] Disconnected: ${message} (code: ${statusCode})`);

    if (this.#hasConnectedOnce) {
      this.#emit('disconnect', { message, statusCode, recoverable });
    }

    if (deleteSession) {
      await this.session?.delete().catch((err) => {
        logger.error(err, `[${this.#flag}] Failed to delete session`);
      });
    }

    if (!recoverable || this.#isShuttingDown) {
      this.#setState(ConnectionState.DISCONNECTED);
      this.#resolvePending(null, new ConnectionError(message, { statusCode, recoverable }));
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
      logger.error(err, `[${this.#flag}] ${err.message}`);
      return;
    }

    if (this.#hasConnectedOnce) {
      this.#setState(ConnectionState.RECONNECTING);
    }

    const delay = this.#backoff(this.#reconnectAttempts);

    const retriesInfo = this.#maxRetries !== Infinity ? `(${this.#reconnectAttempts}/${this.#maxRetries})` : '';

    logger.debug(`[${this.#flag}] ${reason}. Reconnecting in ${delay} ms`);

    const cancelled = await this.#wait(delay);
    if (cancelled || this.#isShuttingDown) return;

    logger.debug(`[${this.#flag}] Executing reconnect attempt ${retriesInfo}`);

    try {
      await this.#createSocket();
    } catch (err) {
      logger.error(err, `[${this.#flag}] Socket creation failed during reconnect`);
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

  #parseDisconnectReason(lastDisconnect) {
    const boom = new Boom(lastDisconnect?.error);
    const statusCode = boom?.output?.statusCode;
    const handler = DISCONNECT_HANDLERS.get(statusCode);

    if (!handler) {
      return {
        message: `Unknown disconnect reason (code: ${statusCode ?? 'unknown'})`,
        statusCode,
        recoverable: true,
        deleteSession: false,
      };
    }

    return { ...handler, statusCode };
  }

  // Authentication

  async #handleAuth(qr) {
    this.#qr = qr;
    if (this.#isConfiguring) return;

    if (typeof this.#onPairing === 'function') {
      const requestPairingCode = this.sock?.requestPairingCode?.bind(this.sock);
      await this.#onPairing({ qr: this.#qr, requestPairingCode });
      return;
    }

    this.#isConfiguring = true;
    this.#authConfig ??= await getConnectionConfig();
    this.#isConfiguring = false;

    if (this.#authConfig.type === "pn") {
      const code = await this.sock.requestPairingCode(this.#authConfig.pn);
      logger.prompt(this.#formatPairingCode(code));
    } else {
      qrcode.generate(this.#qr, { small: true });
      process.stdout.write("\n");
    }
  }

  #formatPairingCode(code) {
    const formatted = code.match(/.{1,4}/g)?.join(" ") ?? code;
    return `\n${chalk.green("> Your OTP Code: ")}${chalk.bold(formatted)}`;
  }

  // Cleanup & Shutdown

  #cleanupSocket() {
    if (!this.sock) return;

    try {
      this.sock.ev.removeAllListeners();
    } catch { /* noop */ };

    this.sock = null;
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

    this.#cleanupSocket();
    this.#setState(ConnectionState.DISCONNECTED);

    this.#isShuttingDown = false;
    this.#hasConnectedOnce = false;
  }

  async logout() {
    try {
      await this.sock?.logout();
      await this.disconnect();
      await this.session?.delete();
    } catch (err) {
      logger.error(err, `[${this.#flag}] Logging out failed: ${err.message}`)
    }
  }
}

export const getClient = async (options) => {
  const client = new Client(options);
  await client.connect();
  return client;
};