import path from 'path';
import { EVENTS } from './config.js';

const plugins = new Map();

const eventCounts = new Map([...EVENTS].map(e => [e, 0]));

const createBucket = () => {
  const allMatch = new Map();
  return {
    auto: new Map(),
    commandMap: new Map(),
    prefixlessMap: new Map(),
    regexList: new Map(),
    allMatch,
    get match() {
      return allMatch;
    },
  };
};

const buckets = Object.fromEntries(
  [...EVENTS].map(e => [e, createBucket()])
);

// Plugin Map Operations

export function getPlugin(id) {
  return plugins.get(id);
}

export function setPlugin(id, plugin) {
  plugins.set(id, plugin);
}

export function deletePlugin(id) {
  plugins.delete(id);
}

export function getAllPlugins() {
  return plugins;
}

export function getPluginCount() {
  return plugins.size;
}

// Bucket Operations

export function getBucket(event) {
  return buckets[event];
}

export function getEventCounts() {
  return eventCounts;
}

export function registerToBuckets(id, plugin) {
  const matchers = plugin._meta?.matchers;
  const isMatch = Boolean(matchers);

  for (const event of plugin._meta.events) {
    const bucket = buckets[event];
    if (!bucket) continue;

    if (!isMatch) {
      if (!bucket.auto.has(id)) {
        eventCounts.set(event, (eventCounts.get(event) ?? 0) + 1);
      }
      bucket.auto.set(id, plugin);
    } else {
      if (!bucket.allMatch.has(id)) {
        eventCounts.set(event, (eventCounts.get(event) ?? 0) + 1);
      }
      bucket.allMatch.set(id, plugin);

      // Index exact string commands with case normalization
      if (matchers.strings && matchers.strings.length > 0) {
        for (const rawCmd of matchers.strings) {
          const normCmd = rawCmd.toLowerCase();

          if (matchers.prefixes && matchers.prefixes.size > 0) {
            for (const rawPrefix of matchers.prefixes) {
              const normPrefix = rawPrefix.toLowerCase();
              const key = `${normPrefix}${normCmd}`;
              let list = bucket.commandMap.get(key);
              if (!list) {
                list = [];
                bucket.commandMap.set(key, list);
              }
              list.push({ id, plugin, match: normCmd, prefix: normPrefix });
            }
          } else {
            let list = bucket.prefixlessMap.get(normCmd);
            if (!list) {
              list = [];
              bucket.prefixlessMap.set(normCmd, list);
            }
            list.push({ id, plugin, match: normCmd, prefix: null });
          }
        }
      }

      // Index regex matchers
      if (matchers.regexes && matchers.regexes.length > 0) {
        bucket.regexList.set(id, { plugin, regexes: matchers.regexes });
      }
    }
  }
}

export function unregisterFromBuckets(id) {
  const plugin = plugins.get(id);
  const events = plugin?._meta?.events ?? [];

  for (const event of events) {
    const bucket = buckets[event];
    if (!bucket) continue;

    let removed = false;
    if (bucket.auto.delete(id)) removed = true;
    if (bucket.allMatch.delete(id)) removed = true;

    // Clean up commandMap
    for (const [key, list] of bucket.commandMap) {
      const filtered = list.filter(item => item.id !== id);
      if (filtered.length === 0) {
        bucket.commandMap.delete(key);
      } else {
        bucket.commandMap.set(key, filtered);
      }
    }

    // Clean up prefixlessMap
    for (const [key, list] of bucket.prefixlessMap) {
      const filtered = list.filter(item => item.id !== id);
      if (filtered.length === 0) {
        bucket.prefixlessMap.delete(key);
      } else {
        bucket.prefixlessMap.set(key, filtered);
      }
    }

    // Clean up regexList
    bucket.regexList.delete(id);

    if (removed) {
      eventCounts.set(event, Math.max(0, (eventCounts.get(event) ?? 1) - 1));
    }
  }
}

export function unloadByFilePath(filePath) {
  const normalizedTarget = path.resolve(filePath);
  const idsToUnload = [];

  for (const [id, plugin] of plugins) {
    if (plugin._meta?.filePath && path.resolve(plugin._meta.filePath) === normalizedTarget) {
      idsToUnload.push(id);
    }
  }

  for (const id of idsToUnload) {
    unregisterFromBuckets(id);
    plugins.delete(id);
  }

  return idsToUnload.length;
}

export function clear() {
  plugins.clear();

  for (const bucket of Object.values(buckets)) {
    bucket.auto.clear();
    bucket.allMatch.clear();
    bucket.commandMap.clear();
    bucket.prefixlessMap.clear();
    bucket.regexList.clear();
  }

  for (const event of EVENTS) {
    eventCounts.set(event, 0);
  }
}