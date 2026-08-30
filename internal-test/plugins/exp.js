export const plugin = async (sock, ctx) => {
  console.log(JSON.stringify({...ctx, raw: undefined}, null, 1));
  await sock.sendMessage(ctx.roomId, { text: "tst" }, { quoted: ctx.raw });
}

plugin.events = ['messages.upsert'];
plugin.match = ['tst'];