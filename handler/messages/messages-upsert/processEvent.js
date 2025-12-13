import {
  isJidGroup, 
  areJidsSameUser,
  getDevice,
  downloadMediaMessage
 } from "baileys"

import { getTimeString, toNumber } from "#helpers.js";
import { extractMessage, extractContent, getPN } from "./toolkit/index.js";

const load = async x => downloadMediaMessage(x, "buffer", {});

export const processEvent = (sock, msg) => {
  const myId = sock.user.lid.split(":")[0] + "@lid";
  const [type, messageData] = extractMessage(msg.message);

  const {
    pushName: name,
    messageTimestamp,
    participant: p1,
    broadcast,
    key: {
      remoteJid: jid, 
      id, fromMe,
      participant: p2,
      addressingMode
    }
  } = msg;
  const sender = fromMe ? myId : p2 || p1 || jid;

  const {
    quotedMessage,
    participant: quotedSender,
    stanzaId: quotedId,
    isForwarded,
    forwardingScore,
  } = messageData?.contextInfo || {};
  const [quotedType, quotedData] = extractMessage(quotedMessage);

  return {
    type, sender, name, jid, id, broadcast, isForwarded, forwardingScore, fromMe,
    timestamp: toNumber(messageTimestamp),
    isLid: addressingMode === "lid",
    device: getDevice(id),
    isGroup: isJidGroup(jid),
    timeString: getTimeString(messageTimestamp),
    ...extractContent(messageData),
    key: msg.key,
    contextInfo: {
      stanzaId: id,
      participant: sender,
      remoteJid: jid
    },
    msg,
    load: async() => await load(msg),
    senderIs: (jid) => areJidsSameUser(sender, jid),
    getPN: async() => await getPN(sock, sender),
    quoted: quotedData ? {
      type: quotedType,
      sender: quotedSender,
      id: quotedId,
      ...extractContent(quotedData),
      key: {
        id: quotedId,
        participant: quotedSender,
        remoteJid: jid,
      },
      contextInfo: {
        stanzaId: quotedId,
        participant: quotedSender,
        remoteJid: jid
      },
      msg: quotedMessage,
      load: async() => await load(quotedMessage),
      senderIs: (jid) => areJidsSameUser(quotedSender, jid),
      getPN: async () => await getPN(sock, quotedSender)
    }: undefined,
  }
}

/** To Do
 * kick
 * up
 * delete
 * reply
 * react
 * edit
*/

/* removed
const isReaction = type === "reactionMessage";
const {
  senderTimestampMs: reactedTimestamp,
  key: {
    participant: reactedSender,
    fromMe: reactedIsMe,
    id: reactedId
  } = {}
} = isReaction ? messageData : {}

reacted: isReaction ? {
  sender: reactedSender,
  isMe: reactedIsMe,
  id: reactedId,
  timestamp: reactedTimestamp,
  key: messageData.key,
  senderIs: (jid) => areJidsSameUser(reactedSender, jid)
}: undefined
*/