import {
  isJidGroup, 
  areJidsSameUser,
  getDevice,
  downloadMediaMessage
 } from "baileys"

import { getTimeString } from "#helpers.js";
import { extractMessage, extractContent, getPN } from "./toolkit/index.js";

const load = async x => downloadMediaMessage(x, "buffer", {});

export const processEvent = (sock, msg) => {
  const [type, messageData] = extractMessage(msg.message);

  const {
    pushName: name,
    messageTimestamp: timestamp,
    broadcast,
    key: {
      remoteJid: jid, 
      id, fromMe,
      participant,
      addressingMode
    }} = msg;
  const sender = participant || jid;

  const {
    quotedMessage,
    participant: quotedSender,
    stanzaId: quotedId,
    isForwarded,
    forwardingScore,
  } = messageData?.contextInfo || {};
  const [quotedType, quotedData] = extractMessage(quotedMessage);

  return {
    type, sender, name, jid, id, timestamp, broadcast, isForwarded, forwardingScore, fromMe,
    isLid: addressingMode === "lid",
    device: getDevice(id),
    isGroup: isJidGroup(jid),
    timeString: getTimeString(timestamp),
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
    getPN: async() => await getPN(sock, jid, sender),
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
      getPN: async () => await getPN(sock, jid, quotedSender)
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