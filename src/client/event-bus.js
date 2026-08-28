import { EventEmitter } from 'events';

/**
 * Creates a lightweight, zero-latency persistent event bus for WASocket.
 * Forwards Baileys events directly to subscribers with zero buffering overhead,
 * maintaining persistent listener registrations across socket reconnections.
 */
export function createPersistentEventBus() {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(0); // Unlimited listeners

  return {
    on(event, listener) {
      emitter.on(event, listener);
      return this;
    },

    off(event, listener) {
      emitter.off(event, listener);
      return this;
    },

    addListener(event, listener) {
      emitter.addListener(event, listener);
      return this;
    },

    removeListener(event, listener) {
      emitter.removeListener(event, listener);
      return this;
    },

    removeAllListeners(event) {
      emitter.removeAllListeners(event);
      return this;
    },

    emit(event, data) {
      return emitter.emit(event, data);
    },

    process(handler) {
      const listener = async (event, data) => {
        try {
          await handler({ [event]: data });
        } catch {
          /* noop */
        }
      };
      emitter.on('event', listener);
      return () => {
        emitter.off('event', listener);
      };
    },

    // Baileys buffer compatibility stubs (Baileys raw socket already handles buffering)
    buffer() {},
    flush() {
      return false;
    },
    isBuffering() {
      return false;
    },
    createBufferedFunction(work) {
      return work;
    },
  };
}

