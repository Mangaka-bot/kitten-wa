import { Mutex } from 'async-mutex';
import { logger } from '#internals.js';
import fs from 'fs/promises';
import path from 'path';
import { pathToFileURL } from 'url';
import { PLUGIN_DIR, EVENTS, defaultEvent } from './config.js';
import { handleError } from './handle-error.js';
import { compile } from './matcher.js';
import { setPlugin, registerToBuckets } from './registry.js';

const fileLocks = new Map();

export function getLock(filePath) {
  const resolved = path.resolve(filePath);
  let lock = fileLocks.get(resolved);
  if (!lock) {
    lock = new Mutex();
    fileLocks.set(resolved, lock);
  }
  return lock;
}

export function deleteLockIfUnused(filePath) {
  const resolved = path.resolve(filePath);
  const lock = fileLocks.get(resolved);
  if (lock && !lock.isLocked()) {
    fileLocks.delete(resolved);
  }
}

export function clearLocks() {
  fileLocks.clear();
}

export function getParentFolder(dirPath) {
  const rel = path.relative(PLUGIN_DIR, path.resolve(dirPath));
  return rel ? rel.split(/[\\/]/)[0] : null;
}

function normalize(value) {
  if (typeof value === 'function') return value;

  if (typeof value?.default === 'function') {
    const { default: fn, ...rest } = value;
    return Object.assign(fn, rest);
  }

  return null;
}

export async function loadFile(filePath, parent, shouldRegister = true) {
  const resolvedPath = path.resolve(filePath);
  const execute = async () => {
    const { mtimeMs } = await fs.stat(resolvedPath);
    const mod = await import(`${pathToFileURL(resolvedPath)}?v=${Math.trunc(mtimeMs)}`);
    const loaded = new Map();

    for (const [name, value] of Object.entries(mod)) {
      const plugin = normalize(value);
      if (!plugin || plugin.enabled === false) continue;

      const id = path.relative(PLUGIN_DIR, resolvedPath)
        .replace(/\.[jt]s$/, '')
        .replaceAll(path.sep, '/')
        .replaceAll('\\', '/') + ':' + name;

      const events = (Array.isArray(plugin.events) ? plugin.events : [])
        .filter(e => EVENTS.has(e));

      plugin._meta = {
        parent,
        filePath: resolvedPath,
        id,
        events: events.length ? events : [defaultEvent],
        matchers: compile(plugin.match, plugin.prefix),
      };

      if (shouldRegister) {
        setPlugin(id, plugin);
        registerToBuckets(id, plugin);
      }

      loaded.set(id, plugin);
    }

    return loaded;
  };

  return shouldRegister
    ? getLock(resolvedPath).runExclusive(execute)
    : execute();
}

export async function loadAll() {
  await fs.mkdir(PLUGIN_DIR, { recursive: true }).catch(() => {});

  const entries = await fs.readdir(PLUGIN_DIR, {
    withFileTypes: true,
    recursive: true
  }).catch(() => []);

  const files = entries
    .filter(e =>
      e.isFile() &&
      /(?<!\.d)\.[jt]s$/.test(e.name) &&
      !e.name.startsWith('_')
    )
    .map(e => {
      const dirPath = e.parentPath ?? e.path ?? PLUGIN_DIR;
      const fullPath = path.resolve(dirPath, e.name);
      return {
        path: fullPath,
        parent: getParentFolder(dirPath)
      };
    });

  const results = await Promise.allSettled(
    files.map(({ path: p, parent }) => loadFile(p, parent))
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
      handleError(`[PluginManager:${rel}] Failed to load:`, result.reason);
    }
  }

  logger.info(
    `[PluginManager] Loaded ${loaded} plugins${failed ? ` (${failed} failed)` : ''}`
  );
}