import { isPnUser } from "baileys";

const extractPN = (jid) => jid.split("@")[0].split(":")[0]

export const getPN = async (sock, jid) => {
  if (isPnUser(jid)) return extractPN(jid);
  const pn = await sock.signalRepository.lidMapping.getPNForLID(jid);
  return extractPN(pn);
}