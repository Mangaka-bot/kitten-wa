import { handleMessageUpsert } from "./handler/index.js"
import { run } from "#helpers.js"

export const handleEvents = async (sock) => {
  sock.ev.on("messages.upsert", async (event) => {
    const promises = await handleMessageUpsert("messages.upsert", sock, event);
    await run(promises);
  })

  sock.ev.on("messages-receipt.update", async () => {
    
  })

  sock.ev.on("messages.delete", async () => {
  
  })

  sock.ev.on("messages.reaction", async () => {
  
  })

  sock.ev.on("messages.update", async () => {
  
  })
}