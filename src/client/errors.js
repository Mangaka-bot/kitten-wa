import { isBoom } from '@hapi/boom';
import { DISCONNECT_HANDLERS } from './constants.js';

export class ConnectionError extends Error {
  constructor(message, { statusCode, recoverable = true } = {}) {
    super(message);
    this.name = 'ConnectionError';
    this.statusCode = statusCode;
    this.recoverable = recoverable;
  }
}

export function parseDisconnectReason(lastDisconnect) {
  const error = lastDisconnect?.error;
  let statusCode = null;

  if (isBoom(error)) {
    statusCode = error.output?.statusCode;
  } else if (error?.output?.statusCode) {
    statusCode = error.output.statusCode;
  } else if (typeof error?.statusCode === 'number') {
    statusCode = error.statusCode;
  }

  if (!statusCode) {
    return {
      message: error?.message || 'Connection failure',
      statusCode: 'NETWORK_ERROR',
      recoverable: true,
      deleteSession: false,
    };
  }

  const handler = DISCONNECT_HANDLERS.get(statusCode);

  if (!handler) {
    return {
      message: error?.message || `Unknown disconnect reason (code: ${statusCode})`,
      statusCode,
      recoverable: true,
      deleteSession: false,
    };
  }

  return { ...handler, statusCode };
}

