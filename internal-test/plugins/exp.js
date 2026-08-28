export const plugin = async (sock, ctx) => {
  console.log(JSON.stringify({...ctx, raw: undefined}, null, 1));
  sock.sendMessage(ctx.roomId, { text: ctx.body }, { quoted: ctx.raw });
}

plugin.events = ['messages.upsert'];
plugin.match = ['tst'];