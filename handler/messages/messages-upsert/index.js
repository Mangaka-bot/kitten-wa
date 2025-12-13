import { processEvent } from "./processEvent.js";

const routing = async (emitter, sock, m) => {
  if (m.content)
    for (const plugin of globalThis.PLUGINS.values())
      if (plugin.command instanceof RegExp && plugin.command.test(m.content)) {
        return await plugin({sock, m, emitter}).catch(e => {
          console.log(`[Plugin Error] at ${plugin.pluginId}`);
          console.error(e.message);
        })
      }
}

// handle <- routing <- store

export const handleMessageUpsert = async (emitter, sock, { messages }) => {
  return messages
    .filter(msg => msg.message && !msg.message?.reactionMessage)
    .map(msg => routing(emitter, sock, processEvent(sock, msg)))
}