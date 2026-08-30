import * as libsignalModule from 'libsignal';
import { logger } from './logger.js';

const libsignal = libsignalModule.default || libsignalModule;

if (libsignal?.SessionRecord?.prototype) {
  libsignal.SessionRecord.prototype.closeSession = function (session) {
    if (this.isClosed(session)) return;
    session.indexInfo.closed = Date.now();
  };

  libsignal.SessionRecord.prototype.openSession = function (session) {
    session.indexInfo.closed = -1;
  };

  libsignal.SessionRecord.prototype.removeOldSessions = function () {
    while (Object.keys(this.sessions).length > 40) {
      let oldestKey;
      let oldestSession;
      for (const [key, session] of Object.entries(this.sessions)) {
        if (
          session.indexInfo.closed !== -1 &&
          (!oldestSession || session.indexInfo.closed < oldestSession.indexInfo.closed)
        ) {
          oldestKey = key;
          oldestSession = session;
        }
      }
      if (oldestKey) {
        delete this.sessions[oldestKey];
      } else {
        throw new Error('Corrupt sessions object');
      }
    }
  };

  logger.debug('libsignal SessionRecord patches applied');
} else {
  logger.warn('libsignal SessionRecord patches skipped — target prototypes not found');
}

if (libsignal?.SessionBuilder?.prototype) {
  libsignal.SessionBuilder.prototype.initIncoming = async function (record, message) {
    const fqAddr = this.addr.toString();
    if (!(await this.storage.isTrustedIdentity(fqAddr, message.identityKey))) {
      throw new libsignal.UntrustedIdentityKeyError(this.addr.id, message.identityKey);
    }
    if (record.getSession(message.baseKey)) {
      return;
    }
    const preKeyPair = await this.storage.loadPreKey(message.preKeyId);
    if (message.preKeyId && !preKeyPair) {
      throw new libsignal.PreKeyError('Invalid PreKey ID');
    }
    const signedPreKeyPair = await this.storage.loadSignedPreKey(message.signedPreKeyId);
    if (!signedPreKeyPair) {
      throw new libsignal.PreKeyError('Missing SignedPreKey');
    }
    const existingOpenSession = record.getOpenSession();
    if (existingOpenSession) {
      record.closeSession(existingOpenSession);
    }
    record.setSession(
      await this.initSession(
        false,
        preKeyPair,
        signedPreKeyPair,
        message.identityKey,
        message.baseKey,
        undefined,
        message.registrationId
      )
    );
    return message.preKeyId;
  };

  logger.debug('libsignal SessionBuilder patches applied');
} else {
  logger.warn('libsignal SessionBuilder patches skipped — target prototypes not found');
}