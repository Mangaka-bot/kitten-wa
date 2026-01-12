import {
  isJidGroup, 
  areJidsSameUser,
  getDevice,
  downloadMediaMessage,
  getContentType,
  isLidUser,
  jidNormalizedUser
 } from 'baileys';

import {
  getTimeString,
  isString,
  toNumber,
  toBase64,
  getPN
} from '#utils.js';

const extractMessage = (message) => {
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
    body: message.text ?? message.caption ??
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
  const myId = jidNormalizedUser(sock.user.lid);
  const [type, messageData] = extractMessage(raw.message);

  const {
    pushName: name,
    messageTimestamp,
    participant: p1,
    broadcast,
    key,
    key: {
      remoteJid: roomId, 
      id, fromMe,
      participant: p2,
    }
  } = raw;

  const jid = fromMe ? myId : p2 || p1 || roomId;

  const {
    quotedMessage,
    participant: quotedSender,
    stanzaId: quotedId,
    isForwarded,
    forwardingScore,
  } = messageData?.contextInfo || {};
  const [quotedType, quotedData] = extractMessage(quotedMessage);

  const quotedKey = {
    id: quotedId,
    participant: quotedSender,
    remoteJid: roomId,
    fromMe: areJidsSameUser(quotedSender, myId)
  };

  return {
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
    timeString: getTimeString(messageTimestamp),
    ...extractContent(messageData),
    key, raw,
    contextInfo: {
      stanzaId: id,
      participant: jid,
      remoteJid: roomId
    },
    load() {
      return load(this.raw)
    },
    senderIs(id) {
      return areJidsSameUser(this.jid, id)
    },
    pn() {
      return getPN(sock, this.jid)
    },
    quoted: quotedData ? {
      type: quotedType,
      jid: quotedSender,
      id: quotedId,
      ...extractContent(quotedData),
      key: quotedKey,
      contextInfo: {
        stanzaId: quotedId,
        participant: quotedSender,
        remoteJid: roomId
      },
      raw: {
        key: quotedKey,
        message: quotedMessage
      },
      load() {
        return load(this.raw)
      },
      senderIs(id) {
        return areJidsSameUser(this.jid, id)
      },
      pn() {
        return getPN(sock, this.jid)
      }
    }: undefined,
  }
}