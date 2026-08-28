import qrcode from 'qrcode-terminal';
import chalk from 'chalk';
import { ConnectionError } from './errors.js';
import { ClientRegistry } from './registry.js';
import { getConnectionConfig } from './getConnectionConfig.js';

/**
 * Formats a pairing code into readable 4-character groups with styling.
 *
 * @param {string} code - The raw pairing code string
 * @returns {string} The styled formatted pairing code
 */
export function formatPairingCode(code) {
  const formatted = code.match(/.{1,4}/g)?.join(' ') ?? code;
  return `\n${chalk.green('> Your OTP Code: ')}${chalk.bold(formatted)}`;
}

/**
 * Handles authentication for a client instance when a QR code or pairing challenge is received.
 *
 * @param {object} params
 * @param {string} params.qr - The QR code string
 * @param {any} params.rawSock - The raw WASocket instance
 * @param {string} params.flag - Identifier string for logging
 * @param {boolean} params.isSync - Whether the client is a background sync instance
 * @param {boolean} params.isSilent - Whether logging/prompts are suppressed
 * @param {Function|null} params.onPairing - Optional custom pairing callback
 * @param {object} params.logger - Logger instance
 * @param {object|null} params.authConfig - Cached auth config
 * @param {(config: object|null) => void} params.setAuthConfig - Setter for auth config
 * @param {boolean} params.pairingCodeRequested - Whether pairing code has already been requested
 * @param {(requested: boolean) => void} params.setPairingCodeRequested - Setter for pairingCodeRequested
 * @param {(err: Error) => void} params.onSyncAuthAbort - Callback when sync connection requires auth
 */
export async function handleClientAuth({
  qr,
  rawSock,
  flag,
  isSync,
  isSilent,
  onPairing,
  logger,
  authConfig,
  setAuthConfig,
  pairingCodeRequested,
  setPairingCodeRequested,
  onSyncAuthAbort,
}) {
  if (isSync) {
    const err = new ConnectionError('Authentication required for sync connection', {
      recoverable: false,
    });
    logger.debug(`[${flag}] Sync connection requires auth, aborting`);
    onSyncAuthAbort(err);
    return;
  }

  if (ClientRegistry.isConfiguring) return;

  if (typeof onPairing === 'function') {
    const requestPairingCode = rawSock?.requestPairingCode?.bind(rawSock);
    await onPairing({ qr, requestPairingCode });
    return;
  }

  if (isSilent) {
    return;
  }

  let currentAuthConfig = authConfig;
  if (!currentAuthConfig) {
    ClientRegistry.isConfiguring = true;
    try {
      currentAuthConfig = await getConnectionConfig();
      setAuthConfig(currentAuthConfig);
    } finally {
      ClientRegistry.isConfiguring = false;
    }
  }

  if (currentAuthConfig.type === 'pn') {
    if (!pairingCodeRequested && rawSock) {
      try {
        setPairingCodeRequested(true);
        const code = await rawSock.requestPairingCode(currentAuthConfig.pn);
        logger.prompt(formatPairingCode(code));
      } catch (err) {
        setPairingCodeRequested(false);
        logger.error(err, `[${flag}] Failed to request pairing code`);
      }
    }
  } else {
    qrcode.generate(qr, { small: true });
    process.stdout.write('\n');
  }
}

