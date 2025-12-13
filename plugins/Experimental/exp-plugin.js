export const plugin = async ({ sock, m }) => {
  const { jid, msg } = m;
  const user = sock.user.lid.split(":")[0] + "@lid";
  console.log(user);
  await sock.sendMessage(jid, { text: user }, { quoted: msg });
  await sock.sendMessage(user, { text: "hello world" }, { quoted: msg })
}

plugin.command = /^\/\//i;
plugin.title = "Testing";
plugin.description = "Testing plugins system";