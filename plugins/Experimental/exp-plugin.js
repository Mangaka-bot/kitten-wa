export const plugin = async ({ sock, m }) => {
  const { contextInfo, jid } = m;
  await sock.sendMessage(jid, { text: "hello world!", contextInfo})
}

plugin.command = /^\/\//gi;
plugin.title = "Testing";
plugin.description = "Testing plugins system";