import { getConfig } from '#internals.js';
import path from 'path';

const config = await getConfig();

export const {
  dir,
  defaultEvent,
  prefixes: PREFIXES,
  hmr: {
    enable: HMREnabled,
    debounce: debounceMs,
    debug: isDebug
  }
} = config.plugins;

export const PLUGIN_DIR = path.join(process.cwd(), dir);

export const EVENTS = Object.freeze(new Set([
  'messaging-history.set', 'chats.upsert', 'chats.update', 'chats.delete',
  'contacts.upsert', 'contacts.update', 'messages.upsert', 'messages.update',
  'messages.delete', 'messages.reaction', 'message-receipt.update',
  'groups.update', 'group-participants.update', 'connection.update',
  'creds.update', 'presence.update', 'blocklist.set', 'blocklist.update', 'call',
]));