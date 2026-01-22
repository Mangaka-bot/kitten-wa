import { logger } from '#internals.js';
import { isDebug } from './config.js';

export function handleError(context, err) {
  if (isDebug) {
    logger.warn(`${context} ${err?.message ?? 'Unknown error'}`);
  }
}