import { isString, toNumber, toBase64 } from "#helpers.js";

export const extractContent = (message = {}) => ({
    content: message.text ?? message.caption ??
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
    thumbnail: message.jpegThumbnail ? toBase64(message.jpegThumbnail) : undefined,
});