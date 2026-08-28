import { formatter } from '#formatter.js';
import { getBucket } from './registry.js';
import { handleError } from './handle-error.js';

export function createHandler(event, sock, isDestroyed, execute) {
  const bucket = getBucket(event);

  const dispatch = (ctx) => {
    if (isDestroyed() || !ctx) return;

    // 1. Execute auto-triggered plugins
    if (bucket.auto.size > 0) {
      for (const [id, plugin] of bucket.auto) {
        execute(id, plugin, sock, ctx, event, null);
      }
    }

    // 2. Execute pattern-matched plugins
    if (bucket.allMatch.size > 0 && ctx.body) {
      const trimmed = ctx.body.trim();
      if (!trimmed) return;
      const lower = trimmed.toLowerCase();
      const spaceIdx = lower.indexOf(' ');
      const firstToken = spaceIdx < 0 ? lower : lower.slice(0, spaceIdx);

      const executedIds = new Set();

      // Fast O(1) command lookup (e.g. "!tst")
      const matchedCommands = bucket.commandMap.get(firstToken);
      if (matchedCommands) {
        for (const item of matchedCommands) {
          executedIds.add(item.id);
          execute(item.id, item.plugin, sock, ctx, event, { match: item.match, prefix: item.prefix });
        }
      }

      // Fast prefixless command lookup (plugins with prefix: false)
      if (bucket.prefixlessMap.size > 0) {
        const matchedPrefixless = bucket.prefixlessMap.get(firstToken);
        if (matchedPrefixless) {
          for (const item of matchedPrefixless) {
            if (!executedIds.has(item.id)) {
              executedIds.add(item.id);
              execute(item.id, item.plugin, sock, ctx, event, { match: item.match, prefix: null });
            }
          }
        }
      }

      // Execute regex plugins if any exist
      if (bucket.regexList.size > 0) {
        for (const [id, item] of bucket.regexList) {
          if (executedIds.has(id)) continue;
          for (const re of item.regexes) {
            re.lastIndex = 0;
            const m = re.exec(ctx.body);
            if (m) {
              executedIds.add(id);
              execute(id, item.plugin, sock, ctx, event, { match: m, prefix: null });
              break;
            }
          }
        }
      }
    }
  };

  switch (event) {
    case 'messages.upsert':
      return ({ messages, type }) => {
        if (type !== 'notify') return;

        for (const msg of messages) {
          if (!msg?.key?.remoteJid || msg.key.remoteJid === 'status@broadcast') {
            continue;
          }

          try {
            dispatch(formatter(sock, msg, event));
          } catch (err) {
            handleError('[PluginManager] Format error:', err);
          }
        }
      };

    case 'messages.update':
      return (updates) => {
        for (const { key, update } of updates) {
          if (key?.remoteJid) {
            dispatch({ key, update, jid: key.remoteJid });
          }
        }
      };

    case 'messages.reaction':
      return (reactions) => {
        for (const { key, reaction } of reactions) {
          if (key?.remoteJid) {
            dispatch({
              key,
              reaction,
              jid: key.remoteJid,
              emoji: reaction?.text,
            });
          }
        }
      };

    case 'group-participants.update':
    case 'connection.update':
      return (update) => dispatch(update);

    case 'creds.update':
      return (creds) => dispatch({ creds });

    case 'call':
      return (calls) => calls.forEach((c) => dispatch(c));

    default:
      return (data) => dispatch({ data });
  }
}