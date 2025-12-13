import db from "#db.js";
import { processEvent } from "../handler/messages/messages-upsert/processEvent.js";
import { chunkArray } from "#helpers.js";
import { prepareGroupOps } from "./storeGroup.js";
import { createTask } from "@shoru/listrx";

const syncTypes = [
  "INITIAL_BOOTSTRAP",
  "INITIAL_STATUS_V3",
  "FULL",
  "RECENT",
  "PUSH_NAME",
  "NON_BLOCKING_DATA",
  "ON_DEMAND",
]

const processBatch = async (elements, func) => {
  if (!elements || !Array.isArray(elements)) return;
  const promises = elements.map(func);
  await Promise.all(promises);
}

const getJidType = (jid) => jid ? jid.split("@")[1] : null;

const checkId = (id) => id && id !== "0@s.whatsapp.net" && id !== "867051314767696@bot";

const mapJid = async (sock, jid) => jid ? await sock.signalRepository.lidMapping.getLIDForPN(jid) : null

const storeHistory = async (sock, { contacts, chats, messages, syncType }) => {
  
  const isBatchEmpty = !(contacts.length || chats.length || messages.length);
  if (isBatchEmpty || syncType === 1 || syncType === 6) return;
  // 1: INITIAL_STATUS_V3
  // 6: ON_DEMAND

  const statistics = `${contacts.length} 👤 ${chats.length} 🗪  ${messages.length} ✉️`;
  const type = syncTypes[syncType] || syncType;

  const task = createTask({
    title: `[Sync-${type}] ${statistics}`,
    showTimer: true,
    setup: (ctx) => {
      ctx.failedOps = 0;
      ctx.operations = [];
    },
    task: async (ctx, t) => {
      
      const processEntity = async (entity) => {
      
        const { id, name, notify } = entity;
        if (!checkId(id)) return;
        
        switch(getJidType(id)) {
      
          case "lid": {
            // LID is already the primary key format
      
            // Prepare User Upsert
            ctx.operations.push(db.user.save({
              where: { id },
              upsert: { name, notify }
            }));
            break;
          }
      
          case "s.whatsapp.net": {
            // Convert Phone Number to LID
            const lid = await mapJid(sock, id)
            if (!lid) {
              console.warn(`[Sync WARN] Cannot map PN for the Jid ${id}`);
              break;
            }
      
            // Prepare User Upsert
            ctx.operations.push(db.user.save({
              where: { id: lid },
              upsert: { name, notify }
            }));
            break;
          }
      
          case "g.us": {
            const groupOps = await prepareGroupOps(sock, id);
            if (!groupOps) break;
            ctx.operations.push(...groupOps);
            break;
          }
        }
      }
      
      const entities = [...contacts, ...chats]
      
      try {
        t.output("Processing Contacts & Chats...");
        await processBatch(entities, processEntity);
        
        // Prepare messages
        if (messages.length > 0) {
          t.output("Processing Messages...");
          await processBatch(messages, async (message) => {
            if (!message.message) return;
        
            const m = processEvent(sock, message);
            const {isGroup, sender, jid, id, msg, type, timestamp}  = m;
        
            if (!checkId(sender)) return;
        
            let senderId;
            switch (getJidType(sender)) {
              case "lid": {
                senderId = sender
                break;
              }
              case "s.whatsapp.net": {
                senderId = await mapJid(sock, sender)
                break;
              }
              case "g.us": {
                return console.error(`[ProcessEvent ERR] wrong returns\n${JSON.stringify(m, null, 2)}`)
              }
              default: return;
            }
            
            // Prepare Message Upsert
            ctx.operations.push(db.message.save({
              where: { id },
              upsert: {
                timestamp,
                senderId,
                groupId: isGroup ? jid : null,
                raw: msg.toJSON(),
                type,
              }
            }));
          })
        }
      } catch (e) { 
        t.output = e.message;
        t.fail(`[Sync-${type}] ${statistics} → Failed`);
      }
    },
    finally: async (ctx, t) => {
      if (t.isFailed) return;

      ctx.operations = ctx.operations.filter(Boolean)
      const totalOps = ctx.operations.length;
      if (totalOps === 0) {
        t.succeed(`[Sync-${type}] ${statistics} → 0 op`);
        return;
      }

      t.output = `Committed 0 / ${totalOps} op`

      let committed = 0;

      for (const chunk of chunkArray(ctx.operations, 100) ) {
        try {
          await db.$transaction(chunk);
          committed += chunk.length;
          t.output = `Committed ${committed} / ${totalOps}`;
        } catch {
          ctx.failedOps += chunk.length;
        }
      }

      if (ctx.failedOps > 0) {
        t.fail(`[Sync-${type}] ${statistics} → ${committed} / ${totalOps} op (${ctx.failedOps} failed)`);
        return;
      } else {
        t.succeed(`[Sync-${type}] ${statistics} → ${totalOps} op`);
        return;
      }
    }
  })

  task.complete().catch(console.error);
};

export default storeHistory;