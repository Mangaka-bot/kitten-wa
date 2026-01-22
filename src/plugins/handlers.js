import { formatter } from '#formatter.js';
import { getBucket } from './registry.js';
import { test } from './matcher.js';
import { handleError } from './handle-error.js';

export function createHandler(event, sock, isDestroyed, execute) {
  const bucket = getBucket(event);

  const dispatch = (ctx) => {
    if (isDestroyed() || !ctx) return;

    // Execute auto-triggered plugins
    for (const [id, plugin] of bucket.auto) {
      execute(id, plugin, sock, ctx, event, null);
    }

    // Execute pattern-matched plugins
    if (bucket.match.size && ctx.body) {
      for (const [id, plugin] of bucket.match) {
        const matchers = plugin._meta?.matchers;
        if (!matchers) continue;

        const result = test(matchers, ctx.body);
        if (result) {
          execute(id, plugin, sock, ctx, event, result);
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
              emoji: reaction?.text
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
      return (calls) => calls.forEach(c => dispatch(c));

    default:
      return (data) => dispatch({ data });
  }
}