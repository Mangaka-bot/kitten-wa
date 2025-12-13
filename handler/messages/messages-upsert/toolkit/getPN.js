const extractPN = (jid) => jid.split("@")[0].split(":")[0]

export const getPN = async (sock, jid) => {
  if (jid.endsWith("s.whatsapp.net")) return extractPN(jid);
  const pn = await sock.signalRepository.lidMapping.getPNForLID(jid);
  return extractPN(pn);
}