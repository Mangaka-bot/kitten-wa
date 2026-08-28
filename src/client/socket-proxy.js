/**
 * Creates a transparent proxy around the underlying WASocket instance.
 * Intercepts the `ev` property to always return the persistent EventBuffer,
 * ensuring all event listeners survive reconnections seamlessly.
 *
 * @param {() => any} getRawSock - Accessor for the active raw WASocket
 * @param {() => any} getEv - Accessor for the persistent EventBuffer
 * @returns {Proxy} The wrapped socket proxy
 */
export function createSocketProxy(getRawSock, getEv) {
  return new Proxy({}, {
    get(target, prop, receiver) {
      if (prop === 'ev') {
        return getEv();
      }
      const raw = getRawSock();
      if (!raw) {
        return undefined;
      }
      const value = Reflect.get(raw, prop, raw);
      if (typeof value === 'function') {
        return value.bind(raw);
      }
      return value;
    },

    set(target, prop, value, receiver) {
      const raw = getRawSock();
      if (raw) {
        return Reflect.set(raw, prop, value, raw);
      }
      return true;
    },

    has(target, prop) {
      if (prop === 'ev') return true;
      const raw = getRawSock();
      return raw ? Reflect.has(raw, prop) : false;
    },

    ownKeys(target) {
      const raw = getRawSock();
      const keys = raw ? Reflect.ownKeys(raw) : [];
      if (!keys.includes('ev')) keys.push('ev');
      return keys;
    },

    getOwnPropertyDescriptor(target, prop) {
      if (prop === 'ev') {
        return { enumerable: true, configurable: true, value: getEv() };
      }
      const raw = getRawSock();
      return raw ? Reflect.getOwnPropertyDescriptor(raw, prop) : undefined;
    }
  });
}

