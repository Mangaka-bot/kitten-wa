import { DisconnectReason } from 'baileys';
import { pino } from '#internals.js';

export const ConnectionState = Object.freeze({
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  RECONNECTING: 'reconnecting',
});

export const DISCONNECT_HANDLERS = new Map([
  [DisconnectReason.connectionClosed, { message: 'Connection closed', recoverable: true }],
  [DisconnectReason.restartRequired, { message: 'Restart required', recoverable: true, isRestart: true }],
  [DisconnectReason.timedOut, { message: 'Connection timed out', recoverable: true }],
  [DisconnectReason.connectionLost, { message: 'Connection lost', recoverable: true }],
  [DisconnectReason.unavailableService, { message: 'Service unavailable', recoverable: true }],
  [DisconnectReason.loggedOut, { message: 'Session logged out', recoverable: false, deleteSession: true }],
  [DisconnectReason.connectionReplaced, { message: 'Connection replaced by another session', recoverable: false }],
  [DisconnectReason.badSession, { message: 'Corrupted session', recoverable: false, deleteSession: true }],
  [DisconnectReason.multideviceMismatch, { message: 'Multi-device mismatch', recoverable: false }],
  [DisconnectReason.forbidden, { message: 'Account banned', recoverable: false, deleteSession: true }],
  [405, { message: 'Not logged in', recoverable: false, deleteSession: true }],
]);

export const silentLogger = Object.freeze({
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  fatal: () => {},
  prompt: () => {},
  child: () => silentLogger,
});

export const silentPino = pino({ level: 'silent' });

export const DEFAULT_MAX_RETRIES = 30;

export const defaultBackoff = (attempt) => Math.min(1000 * 2 ** (attempt - 1), 60_000);

