import db from "#db.js";
import { dedup } from "#helpers.js"

export const prepareGroupOps = async (sock, id) => {

  if (!dedup.attempt(id)) return;

  const ops = [];

  const groupInfo = await sock.groupMetadata(id).catch(({message : e}) => {
    throw new Error(`[Sync ERR] at groupMetadata: ${e}`)
  })
  if (!groupInfo) return [];

  const { owner, participants } = groupInfo;

  // Prepare Group Upsert
  ops.push(db.group.save({
    where: { id },
    upsert: { 
      ownerId: owner, 
      groupInfo,
     }
  }));
  
  participants.forEach(({id: participantId, admin}) => {
    // Prepare User Upsert
    ops.push(db.user.save({
      where: { id: participantId }
    }))

    // Prepare Participant Upsert
    ops.push(db.participant.save({
      where: { 
        userId_groupId: {
          userId: participantId,
          groupId: id
        }
      },
      upsert: { admin }
    }))
  })

  return ops;
}

export const storeGroup = async (sock, id) => {
  try {
    const operations = await prepareGroupOps(sock, id);
    await db.$transaction(operations)
  } catch ({message: e}) {
    console.error(`[Store ERR] cannot store group data:\n${e}`)
  }
}