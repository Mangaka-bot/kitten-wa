import { Browsers } from "baileys";
import db from "#db.js";
import p from "pino";

export const sockConfig = (state) => {
  return {
    auth: state,
    markOnlineOnConnect: false,
    browser: Browsers.macOS("Desktop"),
    generateHighQualityLinkPreview: true,
    syncFullHistory: true,
    logger: p({ level: "silent" }),
    shouldSyncHistoryMessage: () => true,
    getMessage: async ({id}) => (await db.message.findUnique({
      where: { id },
      select: { raw: true}
    }))?.raw,
    cachedGroupMetadata: async (id) => (await db.group.findUnique({
      where: { id },
      select: { groupInfo: true }
    }))?.groupInfo
  }
}