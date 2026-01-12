import { open } from 'lmdb';
import { logger } from './logger.js';
import { getConfig } from './config.js';

const config = await getConfig();

class LMDBDatabaseManager {
  #db = null;
  #config = config.db;
  #isClosing = false;

  constructor(config) {
    this.#config = { ...this.#config, ...config };
  }

  get db() {
    if (this.#isClosing) {
      throw new Error('[LMDBManager] Database is closing');
    }

    if (!this.#db) {
      this.#db = open(this.#config);
    }

    return this.#db;
  }

  get isOpen() {
    return this.#db !== null && !this.#isClosing;
  }

  get config() {
    return Object.freeze({ ...this.#config });
  }

  async close() {
    if (!this.#db || this.#isClosing) return;

    this.#isClosing = true;

    try {
      await this.#db.flushed;
      await this.#db.close();
    } catch (err) {
      logger.error(err, '[LMDBManager] Error closing database');
      throw err;
    } finally {
      this.#db = null;
      this.#isClosing = false;
    }
  }
}

export const LMDBManager = new LMDBDatabaseManager();