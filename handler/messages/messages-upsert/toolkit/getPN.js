export const getPN = async (sock, jid, sender) => 
  sender.endsWith("lid")
  ? (await sock.groupMetadata(jid))
      .participants.find(p => p.lid === sender)?.jid.split("@")[0]
  : sender.split("@")[0];