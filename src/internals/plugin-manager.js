import { Mutex } from 'async-mutex';
import { getConfig, logger } from '#internals.js';
import { watch } from 'chokidar';
import fs from 'fs/promises';
import path from 'path';
import { pathToFileURL } from 'url';
import { formatter } from '#formatter.js';

const config = await getConfig();

const {
  dir,
  defaultEvent,
  prefixes: PREFIXES,
  hmr: {
    enable: HMREnabled,
    debounce: debounceMs,
    debug: isDebug
  }
} = config.plugins;

const PLUGIN_DIR = path.join(process.cwd(), dir);

const EVENTS = new Set([
  'messaging-history.set', 'chats.upsert', 'chats.update', 'chats.delete',
  'contacts.upsert', 'contacts.update', 'messages.upsert', 'messages.update',
  'messages.delete', 'messages.reaction', 'message-receipt.update',
  'groups.update', 'group-participants.update', 'connection.update',
  'creds.update', 'presence.update', 'blocklist.set', 'blocklist.update', 'call',
]);

const createBuckets = () => Object.fromEntries(
  [...EVENTS].map(e => [e, { auto: new Map(), match: new Map() }])
);

export class PluginManager {
  static #plugins = new Map();
  static #watcher = null;
  static #ready = false;
  static #debounceTimers = new Map();
  static #instances = new Set();
  static #fileLocks = new Map();
  static #buckets = createBuckets();
  static #eventCounts = new Map([...EVENTS].map(e => [e, 0]));

  #sock;
  #handlers = new Map();
  #destroyed = false;

  constructor(sock) {
    if (!sock?.ev) throw new TypeError('Invalid socket: missing ev property');
    this.#sock = sock;
  }

  static #getLock(filePath) {
    return PluginManager.#fileLocks.get(filePath)
      ?? PluginManager.#fileLocks.set(filePath, new Mutex()).get(filePath);
  }

  static #handleError(context, err) {
    if (isDebug) {
      logger.warn(`${context} ${err?.message ?? 'Unknown error'}`);
    }
  }

  async init() {
    if (this.#destroyed) throw new Error('Cannot reinitialize destroyed instance');

    PluginManager.#instances.add(this);

    if (!PluginManager.#ready) {
      await fs.mkdir(PLUGIN_DIR, { recursive: true }).catch(() => {});
      await PluginManager.#loadAll();
      if (HMREnabled) PluginManager.#initWatcher();
      PluginManager.#ready = true;
    }

    this.#syncListeners();
    if (isDebug) {
      logger.debug(`[PluginManager] Init (sockets: ${PluginManager.#instances.size}, plugins: ${PluginManager.#plugins.size})`);
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
    PluginManager.#instances.delete(this);

    if (PluginManager.#instances.size === 0) {
      PluginManager.#cleanup();
    }
  }

  static #cleanup() {
    PluginManager.#watcher?.close();
    PluginManager.#watcher = null;
    PluginManager.#ready = false;
    PluginManager.#debounceTimers.forEach(clearTimeout);
    PluginManager.#debounceTimers.clear();
    PluginManager.#fileLocks.clear();
    PluginManager.#plugins.clear();

    for (const bucket of Object.values(PluginManager.#buckets)) {
      bucket.auto.clear();
      bucket.match.clear();
    }

    for (const event of EVENTS) {
      PluginManager.#eventCounts.set(event, 0);
    }
  }

  static #getParent(dirPath) {
    return path.relative(PLUGIN_DIR, dirPath).split(path.sep)[0] || null;
  }

  static async #loadAll() {
    const entries = await fs.readdir(PLUGIN_DIR, { withFileTypes: true, recursive: true }).catch(() => []);

    const files = entries
      .filter(e => e.isFile() && /(?<!\.d)\.[jt]s$/.test(e.name) && !e.name.startsWith('_'))
      .map(e => {
        const dirPath = e.parentPath ?? e.path;
        const parent = PluginManager.#getParent(dirPath);
        const filePath = path.join(dirPath, e.name);
        return { path: filePath, parent };
      });

    const results = await Promise.allSettled(
      files.map(({ path: p, parent }) => PluginManager.#loadFile(p, parent))
    );

    let loaded = 0;
    let failed = 0;
    
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'fulfilled') {
        loaded += result.value?.size ?? 0;
      } else {
        failed++;
        const rel = path.relative(PLUGIN_DIR, files[i].path);
        PluginManager.#handleError(`[PluginManager:${rel}] Failed to load:`, result.reason);
      }
    }

    logger.info(`[PluginManager] Loaded ${loaded} plugins${failed ? ` (${failed} failed)` : ''}`);
  }

  static async #loadFile(filePath, parent, register = true) {
    const exec = async () => {
      const { mtimeMs } = await fs.stat(filePath);
      const mod = await import(`${pathToFileURL(filePath)}?v=${mtimeMs | 0}`);
      const loaded = new Map();

      for (const [name, value] of Object.entries(mod)) {
        const plugin = PluginManager.#normalize(value);
        if (!plugin || plugin.enabled === false) continue;

        const id = path.relative(PLUGIN_DIR, filePath)
          .replace(/\.[jt]s$/, '')
          .replaceAll(path.sep, '/') + ':' + name;

        const events = (Array.isArray(plugin.events) ? plugin.events : [])
          .filter(e => EVENTS.has(e));

        plugin._meta = {
          parent,
          filePath,
          id,
          events: events.length ? events : [defaultEvent],
          matchers: PluginManager.#compile(plugin.match, plugin.prefix),
        };

        if (register) {
          PluginManager.#plugins.set(id, plugin);
          PluginManager.#register(id, plugin);
        }
        loaded.set(id, plugin);
      }
      return loaded;
    };

    return register ? PluginManager.#getLock(filePath).runExclusive(exec) : exec();
  }

  static #normalize(value) {
    if (typeof value === 'function') return value;
    if (typeof value?.default === 'function') {
      const { default: fn, ...rest } = value;
      return Object.assign(fn, rest);
    }
    return null;
  }

  static #compile(match, prefixOpt = PREFIXES) {
    if (!Array.isArray(match) || !match.length) return null;

    const strings = match.filter(m => typeof m === 'string').map(s => s.toLowerCase());
    const regexes = match.filter(m => m instanceof RegExp);

    const prefixes = prefixOpt === false
      ? null
      : prefixOpt
        ? new Set([prefixOpt].flat())
        : new Set(PREFIXES);

    return {
      strings,
      set: strings.length ? new Set(strings) : null,
      regexes,
      prefixes,
    };
  }

  static #test(matchers, body) {
    if (!body || typeof body !== 'string') return null;

    const text = body.toLowerCase();

    if (matchers.set) {
      const prefix = text[0];
      const prefixValid = !matchers.prefixes || matchers.prefixes.has(prefix);

      if (prefixValid) {
        const rest = text.slice(1);
        const idx = rest.indexOf(' ');
        const cmd = idx < 0 ? rest : rest.slice(0, idx);

        if (cmd) {
          if (matchers.set.has(cmd)) {
            return { match: cmd, prefix };
          }

          for (const s of matchers.strings) {
            if (cmd.length > s.length && cmd.startsWith(s)) {
              return { match: s, prefix };
            }
          }
        }
      }
    }

    for (const re of matchers.regexes) {
      re.lastIndex = 0;
      const m = re.exec(body);
      if (m) return { match: m, prefix: null };
    }

    return null;
  }

  static #register(id, plugin) {
    const key = plugin._meta.matchers ? 'match' : 'auto';
    for (const e of plugin._meta.events) {
      const bucket = PluginManager.#buckets[e]?.[key];
      if (bucket && !bucket.has(id)) {
        bucket.set(id, plugin);
        PluginManager.#eventCounts.set(e, (PluginManager.#eventCounts.get(e) ?? 0) + 1);
      }
    }
  }

  static #unregister(id) {
    const events = PluginManager.#plugins.get(id)?._meta?.events ?? [];
    for (const e of events) {
      const bucket = PluginManager.#buckets[e];
      if (bucket?.auto.delete(id) || bucket?.match.delete(id)) {
        PluginManager.#eventCounts.set(e, Math.max(0, (PluginManager.#eventCounts.get(e) ?? 1) - 1));
      }
    }
  }

  #syncListeners() {
    if (this.#destroyed) return;

    const active = new Set();
    for (const [event, count] of PluginManager.#eventCounts) {
      if (count > 0) active.add(event);
    }

    for (const [event, handler] of this.#handlers) {
      if (!active.has(event)) {
        this.#sock.ev.off(event, handler);
        this.#handlers.delete(event);
        if (isDebug) logger.debug(`[Events] (-) ${event}`);
      }
    }

    for (const event of active) {
      if (!this.#handlers.has(event)) {
        const handler = this.#createHandler(event);
        this.#sock.ev.on(event, handler);
        this.#handlers.set(event, handler);
        if (isDebug) logger.debug(`[Events] (+) ${event}`);
      }
    }
  }

  static #syncAll() {
    for (const instance of PluginManager.#instances) {
      instance.#syncListeners();
    }
  }

  #createHandler(event) {
    const bucket = PluginManager.#buckets[event];
    const sock = this.#sock;
    const dispatch = (ctx) => this.#dispatch(sock, ctx, bucket);

    const handlers = {
      'messages.upsert': ({ messages, type }) => {
        if (type !== 'notify') return;
        for (const msg of messages) {
          if (!msg?.key?.remoteJid || msg.key.remoteJid === 'status@broadcast') continue;
          try {
            dispatch(formatter(sock, msg, event));
          } catch (err) {
            PluginManager.#handleError('[PluginManager] Format error:', err);
          }
        }
      },

      'messages.update': (updates) => {
        for (const { key, update } of updates) {
          if (key?.remoteJid) dispatch({ event, key, update, jid: key.remoteJid });
        }
      },

      'messages.reaction': (reactions) => {
        for (const { key, reaction } of reactions) {
          if (key?.remoteJid) dispatch({ event, key, reaction, jid: key.remoteJid, emoji: reaction?.text });
        }
      },

      'group-participants.update': (u) => dispatch({ event, ...u }),
      'connection.update': (u) => dispatch({ event, ...u }),
      'creds.update': (creds) => dispatch({ event, creds }),
      'call': (calls) => calls.forEach(c => dispatch({ event, ...c })),
    };

    return handlers[event] ?? ((data) => dispatch({ event, data }));
  }

  #dispatch(sock, ctx, bucket) {
    if (this.#destroyed) return;

    for (const [id, plugin] of bucket.auto) {
      this.#execute(id, plugin, sock, ctx, null);
    }

    if (bucket.match.size && ctx.body) {
      for (const [id, plugin] of bucket.match) {
        const matchers = plugin._meta?.matchers;
        if (!matchers) continue;

        const result = PluginManager.#test(matchers, ctx.body);
        if (result) this.#execute(id, plugin, sock, ctx, result);
      }
    }
  }

  async #execute(id, plugin, sock, ctx, match) {
    if (this.#destroyed) return;
    try {
      await plugin(sock, match ? { ...ctx, _match: match } : ctx, ctx.event);
    } catch (err) {
      PluginManager.#handleError(`[Plugin:${id}]`, err);
    }
  }

  static #initWatcher() {
    if (PluginManager.#watcher) return;

    PluginManager.#watcher = watch(PLUGIN_DIR, {
      persistent: true,
      ignoreInitial: true,
      ignored: [/(^|[/\\])_/, /\.d\.[jt]s$/, /node_modules/, /(^|[/\\])\../],
      awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 20 },
    })
      .on('add', p => PluginManager.#debounce(p, 'add'))
      .on('change', p => PluginManager.#debounce(p, 'change'))
      .on('unlink', p => PluginManager.#debounce(p, 'unlink'))
      .on('error', e => PluginManager.#handleError('[Watcher]', e));
  }

  static #debounce(filePath, type) {
    clearTimeout(PluginManager.#debounceTimers.get(filePath));
    PluginManager.#debounceTimers.set(
      filePath,
      setTimeout(() => {
        PluginManager.#debounceTimers.delete(filePath);
        PluginManager.#hmr(filePath, type);
      }, debounceMs)
    );
  }

  static async #hmr(filePath, type) {
    const rel = path.relative(PLUGIN_DIR, filePath);

    try {
      await PluginManager.#getLock(filePath).runExclusive(async () => {
        if (type === 'unlink') {
          const n = PluginManager.#unloadFile(filePath);
          logger.info(`[HMR] Unloaded: ${rel} (${n})`);
        } else {
          const parent = PluginManager.#getParent(path.dirname(filePath));
          const plugins = await PluginManager.#loadFile(filePath, parent, false);

          PluginManager.#unloadFile(filePath);

          for (const [id, plugin] of plugins) {
            PluginManager.#plugins.set(id, plugin);
            PluginManager.#register(id, plugin);
          }

          logger.info(`[HMR] ${type === 'add' ? 'Added' : 'Reloaded'}: ${rel} (${plugins.size})`);
        }

        PluginManager.#syncAll();
      });
    } catch (err) {
      PluginManager.#handleError(`[HMR:${rel}] Failed:`, err);
    } finally {
      if (type === 'unlink') {
        const lock = PluginManager.#fileLocks.get(filePath);
        if (lock && !lock.isLocked()) PluginManager.#fileLocks.delete(filePath);
      }
    }
  }

  static #unloadFile(filePath) {
    let count = 0;
    for (const [id, plugin] of PluginManager.#plugins) {
      if (plugin._meta?.filePath === filePath) {
        PluginManager.#unregister(id);
        PluginManager.#plugins.delete(id);
        count++;
      }
    }
    return count;
  }

  get(id) {
    return PluginManager.#plugins.get(id);
  }

  get all() {
    return new Map(PluginManager.#plugins);
  }

  get events() {
    return [...this.#handlers.keys()];
  }

  get destroyed() {
    return this.#destroyed;
  }

  static get instances() {
    return PluginManager.#instances.size;
  }

  static get count() {
    return PluginManager.#plugins.size;
  }
}

export const pluginManager = async (sock) => {
  const manager = new PluginManager(sock);
  await manager.init();
  return manager;
}