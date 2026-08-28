import { logger, getClient } from '../src/index.js';

logger.level = 'debug';
await getClient();