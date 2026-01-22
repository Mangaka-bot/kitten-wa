import { logger } from '#internals.js';
import { HMREnabled, isDebug } from './config.js';
import { handleError } from './handle-error.js';
import {
  getPlugin,
  getAllPlugins,
  getPluginCount,
  getEventCounts,
  clear as clearRegistry
} from './registry.js';
import { loadAll, clearLocks } from './loader.js';
import { initWatcher, closeWatcher, clearTimers, onSync } from './watcher.js';
import { createHandler } from './handlers.js';

const instances = new Set();

let ready = false;

function syncAllInstances() {
  for (const instance of instances) {
    instance._syncListeners();
  }
}

function cleanup() {
  closeWatcher();
  clearTimers();
  clearLocks();
  clearRegistry();
  ready = false;
}

export class PluginManager {
  #sock;
  #handlers = new Map();
  #destroyed = false;

  constructor(sock) {
    if (!sock?.ev) {
      throw new TypeError('Invalid socket: missing ev property');
    }
    this.#sock = sock;
  }

  async init() {
    if (this.#destroyed) {
      throw new Error('Cannot reinitialize destroyed instance');
    }

    instances.add(this);

    if (!ready) {
      await loadAll();

      if (HMREnabled) {
        initWatcher();
        onSync(syncAllInstances);
      }

      ready = true;
    }

    this._syncListeners();

    if (isDebug) {
      logger.debug(
        `[PluginManager] Init (sockets: ${instances.size}, plugins: ${getPluginCount()})`
      );
    }

    return this;
  }

  destroy() {
    if (this.#destroyed) return;
    this.#destroyed = true;

    for (const [event, handler] of this.#handlers) {
      this.#sock.ev.off(event, handler);
    }

    this.#handlers.clear();
    instances.delete(this);

    if (instances.size === 0) {
      cleanup();
    }
  }

  _syncListeners() {
    if (this.#destroyed) return;

    const eventCounts = getEventCounts();
    const activeEvents = new Set();

    for (const [event, count] of eventCounts) {
      if (count > 0) activeEvents.add(event);
    }

    // Remove inactive events
    for (const [event, handler] of this.#handlers) {
      if (!activeEvents.has(event)) {
        this.#sock.ev.off(event, handler);
        this.#handlers.delete(event);
        if (isDebug) logger.debug(`[Events] (-) ${event}`);
      }
    }

    // Add active events
    for (const event of activeEvents) {
      if (!this.#handlers.has(event)) {
        const handler = createHandler(
          event,
          this.#sock,
          () => this.#destroyed,
          this.#execute.bind(this)
        );

        this.#sock.ev.on(event, handler);
        this.#handlers.set(event, handler);
        if (isDebug) logger.debug(`[Events] (+) ${event}`);
      }
    }
  }

  async #execute(id, plugin, sock, ctx, event, match) {
    if (this.#destroyed) return;

    try {
      const context = match ? { ...ctx, _match: match } : ctx;
      await plugin(sock, context, event);
    } catch (err) {
      handleError(`[Plugin:${id}]`, err);
    }
  }

  get(id) {
    return getPlugin(id);
  }

  get all() {
    return new Map(getAllPlugins());
  }

  get events() {
    return [...this.#handlers.keys()];
  }

  get destroyed() {
    return this.#destroyed;
  }

  static get instances() {
    return instances.size;
  }

  static get count() {
    return getPluginCount();
  }
}

export async function pluginManager(sock) {
  const manager = new PluginManager(sock);
  await manager.init();
  return manager;
}