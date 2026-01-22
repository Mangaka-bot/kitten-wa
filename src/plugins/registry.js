import { EVENTS } from './config.js';

const plugins = new Map();

const eventCounts = new Map([...EVENTS].map(e => [e, 0]));

const buckets = Object.fromEntries(
  [...EVENTS].map(e => [e, { auto: new Map(), match: new Map() }])
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
  const key = plugin._meta.matchers ? 'match' : 'auto';

  for (const event of plugin._meta.events) {
    const bucket = buckets[event]?.[key];
    if (bucket && !bucket.has(id)) {
      bucket.set(id, plugin);
      eventCounts.set(event, (eventCounts.get(event) ?? 0) + 1);
    }
  }
}

export function unregisterFromBuckets(id) {
  const plugin = plugins.get(id);
  const events = plugin?._meta?.events ?? [];

  for (const event of events) {
    const bucket = buckets[event];
    if (bucket?.auto.delete(id) || bucket?.match.delete(id)) {
      eventCounts.set(event, Math.max(0, (eventCounts.get(event) ?? 1) - 1));
    }
  }
}

export function unloadByFilePath(filePath) {
  const idsToUnload = [];

  for (const [id, plugin] of plugins) {
    if (plugin._meta?.filePath === filePath) {
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
    bucket.match.clear();
  }

  for (const event of EVENTS) {
    eventCounts.set(event, 0);
  }
}