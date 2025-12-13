import { Prisma, Presence } from "../generated/prisma/client.ts";
import { flattenObj } from "#helpers.js"

const { defineExtension: ext, getExtensionContext: getCtx } = Prisma;

const statsBase = Object.keys(Presence).reduce(
  (acc, key) => (acc[key] = 0, acc), {}
);

const formatIn = (id) => (Array.isArray(id) ? id : [id]);
const formatOut = (output, id) => Array.isArray(id) ? output : output[0] || null;

export const modelExtensions = ext({
  name: "modelExtensions",
  model: {
    $allModels: {
      save({ where, upsert, create }) {
        const ctx = getCtx(this);
        const updateData = upsert || {};
        const whereData = flattenObj(where)
        const createData = create || { ...whereData, ...updateData };
        return ctx.upsert({
          where,
          update: updateData,
          create: createData,
        });
      },
    },
  },
});

export const groupExtensions = ext({
  name: "groupExtensions",
  client: {
    async fetchGroup(id) {
      const ctx = getCtx(this);
      const ids = formatIn(id);

      const groups = await ctx.group.findMany({
        where: {
          id: { in: ids }
        },
        omit: { messages: true }
      });
      return formatOut(groups, id);
    },
    fetchAllGroups() {
      const ctx = getCtx(this);
      return ctx.group.findMany({
        omit: { messages: true }
      })
    },
    async groupStatistics(id) {
      const ctx = getCtx(this);
      const ids = formatIn(id);

      const groups = await ctx.group.findMany({
        where: {
          id: { in: ids }
        },
        select: {
          id: true,
          _count: {
            select: {
              messages: true,
              participants: true
            }
          }
        }
      });

      const results = groups.map((g) => ({
        id: g.id,
        count: g._count
      }));

      return formatOut(results, id);
    },
    async allGroupsStatistics() {
      const ctx = getCtx(this);
      const [groups, total] = await ctx.$transaction([
        ctx.group.findMany({
          select: {
            id: true,
            _count: {
              select: {
                messages: true,
                participants: true
              }
            }
          }
        }),
        ctx.group.count()
      ])

      return {
        groups: groups.map((g) => ({
          id: g.id,
          ...g._count
        })),
        total
      }
    },
    async groupPresence(id) {
      const ctx = getCtx(this);
      const ids = formatIn(id);

      const participants = await ctx.participant.findMany({
        where: {
          groupId: { in: ids }
        },
        select: {
          groupId: true,
          user: {
            select: { presence: true }
          }
        }
      });

      const groupsMap = new Map();

      for (const p of participants) {
        const { groupId } = p;
        
        if (!groupsMap.has(groupId)) {
          groupsMap.set(groupId, { ...statsBase });
        }

        const stats = groupsMap.get(groupId);
        const status = p.user?.presence || "unavailable";
        stats[status]++;
      }

      const results = ids.map((groupId) => {
        const stats = groupsMap.get(groupId) || { ...statsBase };
        return { id: groupId, ...stats };
      });

      return formatOut(results, id);
    },
    async allGroupsPresence() {
      const ctx = getCtx(this);

      const participants = await ctx.participant.findMany({
        select: {
          groupId: true,
          user: {
            select: { presence: true }
          }
        }
      });

      const groupsMap = new Map();

      for (const p of participants) {
        const { groupId } = p;
        const status = p.user?.presence || "unavailable";

        if (!groupsMap.has(groupId)) {
          groupsMap.set(groupId, { ...statsBase });
        }

        const stats = groupsMap.get(groupId);
        stats[status]++;
      }

      return Array.from(groupsMap.entries()).map(([id, stats]) => ({
        id, ...stats
      }));
    },
  }
});

export const metadataExtensions = ext({
  name: "metadataExtensions",
  client: {
    updateGroupMetadata(id, metadata) {
      const ctx = getCtx(this);
      return ctx.group.update({
        where: { id },
        data: { metadata }
      })
    },
    async groupMetadata(id) {
      const ctx = getCtx(this);
      const result = await ctx.group.findUnique({
        where: { id },
        select: { metadata: true }
      });
      return result?.metadata;
    },
    updateUserMetadata(id, metadata) {
      const ctx = getCtx(this);
      return ctx.user.update({
        where: { id },
        data: { metadata }
      })
    },
    async userMetadata(id) {
      const ctx = getCtx(this);
      const result = await ctx.user.findUnique({
        where: { id },
        select: { metadata: true }
      });
      return result?.metadata;
    },
  }
});

export const userExtensions = ext({
  name: "userExtensions",
  client: {
    async userPresence(id) {
      const ctx = getCtx(this);
      const ids = formatIn(id);

      const stats = await ctx.user.findMany({
        where: {
          id: { in: ids }
        },
        select: {
          id: true,
          presence: true
        }
      });

      return formatOut(stats, id);
    },
    async globalPresence() {
      const ctx = getCtx(this);

      const groupedData = await ctx.user.groupBy({
        by: ["presence"],
        _count: true
      });

      const stats = { ...statsBase };

      let total = 0;
      groupedData.forEach((item) => {
        const status = item.presence || "unavailable";
        stats[status] = item._count;
        total += item._count;
      });

      return { ...stats, total }
    },
  }
});