import { handleMessageUpsert } from "./handler/index.js";
import storeHistory from "./store/storeHistory.js";
import { run } from "#helpers.js";

export const handleEvents = async (sock) => {
  sock.ev.on("messaging-history.set", async (event) => {
    await storeHistory(sock, event)
  }) 
  
  sock.ev.on("messages.upsert", async (event) => {
    const promises = await handleMessageUpsert("messages.upsert", sock, event);
    await run(promises);
  })
}