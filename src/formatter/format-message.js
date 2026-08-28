import {
  isJidGroup,
  areJidsSameUser,
  getDevice,
  downloadMediaMessage,
  getContentType,
  isLidUser,
  jidNormalizedUser,
} from 'baileys';

import {
  getTimeString,
  isString,
  toNumber,
  toBase64,
  getPN,
} from '#utils.js';

const extractMessage = (message) => {
  if (!message) return [undefined, undefined];
  let type = getContentType(message);
  let data = message?.[type];

  // cases like viewonce or document messages etc
  if (data?.message) {
    const innerType = getContentType(data.message);
    if (innerType) {
      type = innerType;
      data = data.message[type];
    }
  }
  return [type, data];
};

const extractContent = (message = {}) => ({
  body:
    message.text ??
    message.caption ??
    (isString(message) ? message : undefined),
  mentions: message.contextInfo?.mentionedJid,
  groupMentions: message.contextInfo?.groupMentions,
  mimetype: message.mimetype,
  fileName: message.fileName,
  pageCount: message.pageCount,
  fileLength: toNumber(message.fileLength),
  hash: toBase64(message.fileSha256),
  isViewOnce: message.viewOnce,
  url: message.matchedText,
  description: message.description,
  thumbnail: message.jpegThumbnail,
});

const load = async (x) => downloadMediaMessage(x, 'buffer', {});

export const formatMessage = (sock, raw) => {
  const userJid = sock.user?.lid || sock.user?.id || '';
  const myId = userJid ? jidNormalizedUser(userJid) : '';
  const [type, messageData] = extractMessage(raw.message);

  const {
    pushName: name,
    messageTimestamp,
    participant: p1,
    broadcast,
    key,
    key: {
      remoteJid: roomId,
      id,
      fromMe,
      participant: p2,
    } = {},
  } = raw;

  const jid = fromMe ? myId : p2 || p1 || roomId;

  const {
    quotedMessage,
    participant: quotedSender,
    stanzaId: quotedId,
    isForwarded,
    forwardingScore,
  } = messageData?.contextInfo || {};
  const [quotedType, quotedData] = quotedMessage ? extractMessage(quotedMessage) : [undefined, undefined];

  const quotedKey = quotedData
    ? {
        id: quotedId,
        participant: quotedSender,
        remoteJid: roomId,
        fromMe: areJidsSameUser(quotedSender, myId),
      }
    : undefined;

  let cachedTimeString;
  let cachedQuoted;

  const msg = {
    type,
    name,
    id,
    broadcast,
    isForwarded,
    forwardingScore,
    fromMe,
    jid,
    roomId,
    timestamp: toNumber(messageTimestamp),
    isLid: isLidUser(jid),
    device: getDevice(id),
    isGroup: isJidGroup(roomId),
    ...extractContent(messageData),
    key,
    raw,
    contextInfo: {
      stanzaId: id,
      participant: jid,
      remoteJid: roomId,
    },
    load() {
      return load(this.raw);
    },
    senderIs(targetId) {
      return areJidsSameUser(this.jid, targetId);
    },
    pn() {
      return getPN(sock, this.jid);
    },
  };

  Object.defineProperty(msg, 'timeString', {
    enumerable: true,
    configurable: true,
    get() {
      if (cachedTimeString === undefined) {
        cachedTimeString = getTimeString(messageTimestamp);
      }
      return cachedTimeString;
    },
  });

  Object.defineProperty(msg, 'quoted', {
    enumerable: true,
    configurable: true,
    get() {
      if (!quotedData) return undefined;
      if (cachedQuoted === undefined) {
        let cachedQuotedTimeString;
        cachedQuoted = {
          type: quotedType,
          jid: quotedSender,
          id: quotedId,
          ...extractContent(quotedData),
          key: quotedKey,
          contextInfo: {
            stanzaId: quotedId,
            participant: quotedSender,
            remoteJid: roomId,
          },
          raw: {
            key: quotedKey,
            message: quotedMessage,
          },
          load() {
            return load(this.raw);
          },
          senderIs(targetId) {
            return areJidsSameUser(this.jid, targetId);
          },
          pn() {
            return getPN(sock, this.jid);
          },
        };
        Object.defineProperty(cachedQuoted, 'timeString', {
          enumerable: true,
          configurable: true,
          get() {
            if (cachedQuotedTimeString === undefined) {
              cachedQuotedTimeString = getTimeString(messageTimestamp);
            }
            return cachedQuotedTimeString;
          },
        });
      }
      return cachedQuoted;
    },
  });

  return msg;
};