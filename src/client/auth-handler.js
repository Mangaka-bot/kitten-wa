import chalk from 'chalk';
import { ConnectionError } from './errors.js';
import { ClientRegistry } from './registry.js';
import { getConnectionConfig } from './getConnectionConfig.js';
import { QR } from './qr.js';

export function formatPairingCode(code) {
  const formatted = code.match(/.{1,4}/g)?.join(' ') ?? code;
  return `\n${chalk.green('> Your OTP Code: ')}${chalk.bold(formatted)}`;
}

export async function handleClientAuth({
  qr,
  rawSock,
  flag,
  isSync,
  isSilent,
  onPairing,
  attempts,
  maxAttempts,
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

  const qrObj = qr instanceof QR ? qr : new QR(qr);

  if (ClientRegistry.isConfiguring) return;

  if (typeof onPairing === 'function') {
    const requestPairingCode = rawSock?.requestPairingCode?.bind(rawSock);
    await onPairing({ qr: qrObj, requestPairingCode, attempts, maxAttempts });
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
    await qrObj.print();
    process.stdout.write('\n');
  }
}