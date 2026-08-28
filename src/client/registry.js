const clients = new Map();

let isSyncing = false;
let isConfiguring = false;

export const ClientRegistry = {
  get(id) {
    return clients.get(id);
  },

  has(id) {
    return clients.has(id);
  },

  set(id, client) {
    if (id != null) {
      clients.set(id, client);
    }
  },

  delete(id) {
    if (id != null) {
      clients.delete(id);
    }
  },

  get size() {
    return clients.size;
  },

  keys() {
    return clients.keys();
  },

  values() {
    return clients.values();
  },

  entries() {
    return clients.entries();
  },

  [Symbol.iterator]() {
    return clients.values();
  },

  get isSyncing() {
    return isSyncing;
  },

  set isSyncing(val) {
    isSyncing = Boolean(val);
  },

  get isConfiguring() {
    return isConfiguring;
  },

  set isConfiguring(val) {
    isConfiguring = Boolean(val);
  },
};

