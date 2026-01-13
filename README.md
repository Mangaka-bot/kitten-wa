<div align="left">

<img src="https://files.catbox.moe/j7dpni.png" align="right" width="220" alt="Kitten Logo">

<a name="-kitten"></a>
# **Kitten Framework**

### A powerful `Node.js` framework to simplify making WhatsApp Bots. built on top of the [Baileys](https://github.com/WhiskeySockets/Baileys) library. 😺

![State](https://img.shields.io/badge/State-BETA-5a67d8?style=for-the-badge&logo=activity)
[![npm](https://img.shields.io/npm/v/@shoru/kitten.svg?style=for-the-badge)](https://www.npmjs.com/package/@shoru/kitten)
[![License](https://img.shields.io/github/license/Mangaka-bot/kitten-wa?style=for-the-badge)](https://github.com/Mangaka-bot/kitten-wa/blob/main/LICENSE)

</div>

---

## Table of Contents

1. [Introduction](#introduction)
2. [Getting Started](#getting-started)
3. [Configuration](#configuration)
4. [Plugin System](#plugin-system)
5. [Message Formatting](#message-formatting)
6. [Session Management](#session-management)
7. [Utilities](#utilities)
8. [API Reference](#api-reference)

---

## Introduction

Kitten simplifies WhatsApp bot development by providing:

- **Persistent Sessions** — LMDB-powered storage with automatic recovery
- **Smart Reconnection** — Exponential backoff with configurable retry limits
- **Plugin System** — File-based plugins with Hot Module Replacement
- **Multi-Session** — Automatic restoration of all saved sessions
- **Flexible Auth** — QR code or pairing code authentication

---

## Getting Started

### Installation

```bash
npm install @shoru/kitten
```

### Basic Usage

```javascript
import { getClient } from '@shoru/kitten';

const { sock, session, id } = await getClient();

sock.ev.on('messages.upsert', async ({ messages }) => {
  const msg = messages[0];
  if (msg.message?.conversation === 'ping') {
    await sock.sendMessage(msg.key.remoteJid, { text: 'pong!' });
  }
});
```

> **Note:** `getClient()` automatically restores all previously saved sessions in the background.

### With Options

```javascript
import { getClient } from '@shoru/kitten';

const { sock, session, id } = await getClient({
  id: 0,                    // Session ID (auto-generated if omitted)
  maxRetries: 30,           // Reconnection attempts
  silent: false,            // Suppress output
  socketConfig: {},         // Baileys socket overrides
  
  // Callbacks
  onConnect: ({ client }) => {
    console.log(`Connected with session ${client.id}`);
  },
  onReconnect: ({ client, attempts }) => {
    console.log(`Reconnected after ${attempts} attempts`);
  },
  onDisconnect: ({ message, statusCode, recoverable }) => {
    console.log(`Disconnected: ${message}`);
  },
  onStateChange: ({ oldState, newState }) => {
    console.log(`State: ${oldState} → ${newState}`);
  }
});
```

### Custom Authentication

```javascript
import qrcode from 'qrcode-terminal';

const { sock, id } = await getClient({
  onPairing: async ({ qr, requestPairingCode }) => {
    // Option 1: Display QR code
    console.log('Scan QR:');
    qrcode.generate(qr, { small: true });
    
    // Option 2: Use pairing code
    const code = await requestPairingCode('1234567890');
    console.log('Enter this code in WhatsApp:', code);
  }
});
```

### Return Value

```javascript
const { sock, session, id } = await getClient();

sock                      // Baileys WASocket instance
id                        // Numeric session identifier
session.id                // Same as id
await session.delete()    // Remove session from database
await session.clear()     // Clear keys, keep credentials
```

---

## Configuration

Kitten uses [cosmiconfig](https://github.com/cosmiconfig/cosmiconfig). Create one of:

- `kittenwa.config.js`
- `kittenwa.config.mjs`  
- `.kittenwarc.json`
- `package.json` → `"kittenwa": {}`

### Default Values

```javascript
export default {
  socket: {
    browser: Browsers.ubuntu('Chrome'),
    markOnlineOnConnect: false,
    syncFullHistory: false,
    generateHighQualityLinkPreview: true,
    logger: pino({ level: 'silent' })
  },

  db: {
    path: './db',
    compression: true,
    mapSize: 2 * 1024 * 1024 * 1024  // 2GB
  },

  plugins: {
    dir: 'plugins',
    prefixes: ['.', '\\', '!'],
    defaultEvent: 'messages.upsert',
    hmr: {
      enable: false,
      debounce: 200,
      debug: false
    }
  },

  timeZone: 'Africa/Casablanca'
}
```

### Custom Configuration

```javascript
// kittenwa.config.js
export default {
  plugins: {
    dir: 'src/plugins',
    prefixes: ['/', '!'],
    hmr: { enable: true }
  },
  timeZone: 'America/New_York'
};
```

---

## Plugin System

File-based plugins with automatic loading and optional Hot Module Replacement.

### Directory Structure

```
plugins/
├── greetings/
│   ├── hello.js
│   └── goodbye.js
├── admin/
│   └── ban.js
└── utils.js
```

### Basic Plugin

```javascript
// plugins/ping.js
export function ping(sock, ctx, event) {
  if (ctx.body === '!ping') {
    sock.sendMessage(ctx.roomId, { text: 'pong!' });
  }
}
```

### Plugin with Options

```javascript
// plugins/commands.js
export const help = async (sock, ctx) => {
  await sock.sendMessage(ctx.roomId, { 
    text: 'Available: !help, !ping, !info' 
  });
}

help.match: ['help', 'h', '?'];
help.prefix: ['!', '/'];
help.events: ['messages.upsert'];
help.enabled: true;
```

### Options Reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `match` | `(string \| RegExp)[]` | `[]` | Command triggers |
| `prefix` | `string[] \| false` | Config value | Required prefixes |
| `events` | `string[]` | `['messages.upsert']` | Events to listen |
| `enabled` | `boolean` | `true` | Toggle plugin |

### Regex Matching

```javascript
export const urlDetector = (sock, ctx) => {
  const match = ctx._match.match;  // RegExp exec result
  console.log('URL found:', match[0]);
}

urlDetector.match = [/https?:\/\/\S+/gi];
```

### Match Context

When a command matches, `ctx._match` is added:

```javascript
// User sends: "!help me"
ctx._match = {
  match: 'help',    // Matched string or RegExp result
  prefix: '!'       // Used prefix (null for regex)
}
```

### Supported Events

```
messages.upsert          messages.update         messages.delete
messages.reaction        message-receipt.update  messaging-history.set
chats.upsert             chats.update            chats.delete
contacts.upsert          contacts.update         groups.update
group-participants.update                        presence.update
connection.update        creds.update            call
blocklist.set            blocklist.update
```

### Hot Module Replacement

Enable for development:

```javascript
// kittenwa.config.js
export default {
  plugins: {
    hmr: {
      enable: true,
      debounce: 200,
      debug: true
    }
  }
};
```

Console output:
```
[HMR] Added: greetings/hello.js (2)
[HMR] Reloaded: commands.js (3)
[HMR] Unloaded: old-plugin.js (1)
```

### Naming Rules

| Pattern | Status |
|---------|--------|
| `command.js` | ✅ Loaded |
| `command.ts` | ✅ Loaded |
| `_helper.js` | ❌ Ignored |
| `types.d.ts` | ❌ Ignored |

---

## Message Formatting

Normalize raw Baileys messages into a consistent structure.

### Usage

```javascript
import { formatter } from '@shoru/kitten';

sock.ev.on('messages.upsert', ({ messages }) => {
  const msg = formatter(sock, messages[0]);
  
  console.log(msg.name);      // Sender name
  console.log(msg.body);      // Text content
  console.log(msg.isGroup);   // Boolean
});
```

### Message Structure

```javascript
{
  // Identity
  type: 'conversation',
  id: 'ABC123',
  name: 'John',
  jid: '123@s.whatsapp.net',
  fromMe: false,
  
  // Chat
  roomId: '123@s.whatsapp.net',
  isGroup: false,
  broadcast: false,
  
  // Content
  body: 'Hello!',
  mentions: [],
  mimetype: 'image/jpeg',
  fileName: 'photo.jpg',
  fileLength: 12345,
  hash: 'abc123...',
  isViewOnce: false,
  thumbnail: Buffer,
  
  // Forwarding
  isForwarded: false,
  forwardingScore: 0,
  
  // Timing
  timestamp: 1699999999,
  timeString: ['November 14, 2023', '12:26:39'],
  
  // Device
  device: 'android',
  isLid: false,
  
  // Raw data
  key: { ... },
  raw: { ... },
  contextInfo: { ... },
  
  // Methods
  async load() → Buffer,
  senderIs(jid) → boolean,
  async pn() → string,
  
  // Quoted message (when replying)
  quoted: { /* same structure */ }
}
```

### Common Patterns

```javascript
// Download media
if (msg.mimetype?.startsWith('image/')) {
  const buffer = await msg.load();
  fs.writeFileSync('image.jpg', buffer);
}

// Handle replies
if (msg.quoted) {
  console.log('Replying to:', msg.quoted.body);
}

// Check sender
if (msg.senderIs(adminJid)) {
  // Execute admin command
}

// Get phone number
const phone = await msg.pn();
```

---

## Session Management

Sessions persist automatically in LMDB and are restored on startup.

### Automatic Restoration

When you call `getClient()`, all previously saved sessions are automatically restored in the background. No manual iteration required.

```javascript
import { getClient } from '@shoru/kitten';

// This connects the current session AND restores all others
const { sock } = await getClient({ id: 0 });
```

### Session Utilities

```javascript
import { listSessions, sessionExists } from '@shoru/kitten';

// List all saved session IDs
const ids = listSessions();  // [0, 1, 2]

// Check if a session exists
if (sessionExists(1)) {
  console.log('Session 1 exists');
}
```

### Session Operations

```javascript
const { session } = await getClient();

session.id                // Numeric identifier
await session.clear()     // Clear keys, keep credentials
await session.delete()    // Remove entire session
```

---

## Utilities

### Logger

```javascript
import { logger } from '@shoru/kitten';

logger.info('Information');
logger.debug({ data }, 'Context');
logger.warn('Warning');
logger.error(err, 'Error');
logger.prompt('Direct output');
```

### Database

```javascript
import { LMDBManager } from '@shoru/kitten';

const { db } = LMDBManager;

const value = db.get('key');
await db.put('key', 'value');
await db.remove('key');

LMDBManager.isOpen      // Boolean
await LMDBManager.close();
```

### Configuration

```javascript
import { getConfig } from '@shoru/kitten';

const config = await getConfig();
console.log(config.plugins.dir);
```

### Serialization

```javascript
import { serialize, deserialize } from '@shoru/kitten';

const json = serialize({ buffer: Buffer.from('hello') });
const data = deserialize(json);
```

### Time Formatting

```javascript
import { getTimeString } from '@shoru/kitten';

const [date, time] = getTimeString(1699999999);
// ['November 14, 2023', '12:26:39']
```

### Type Helpers

```javascript
import { isString, toNumber, toBase64 } from '@shoru/kitten';

isString('hello')              // true
toNumber(BigInt(123))          // 123
toBase64(Buffer.from('hi'))    // 'aGk='
```

### Phone Number

```javascript
import { getPN } from '@shoru/kitten';

const phone = await getPN(sock, jid);  // '1234567890'
```

### Spinner

```javascript
import { spinner, pauseSpinner } from '@shoru/kitten';

spinner.start('Loading...');
spinner.stop();

// Pause during prompts
const result = await pauseSpinner(async () => {
  return await askUser();
});
```

---

## API Reference

### Primary

```javascript
import { getClient } from '@shoru/kitten';

await getClient(options?) → { sock, session, id }
```

### Sessions

```javascript
import { listSessions, sessionExists } from '@shoru/kitten';

listSessions() → number[]
sessionExists(id) → boolean
```

### Formatting

```javascript
import { formatter } from '@shoru/kitten';

formatter(sock, rawMessage, eventName?) → FormattedMessage
```

### Infrastructure

```javascript
import { 
  getConfig,
  logger,
  LMDBManager,
  spinner,
  pauseSpinner
} from '@shoru/kitten';
```

### Utilities

```javascript
import {
  serialize,
  deserialize,
  getTimeString,
  isString,
  toNumber,
  toBase64,
  getPN
} from '@shoru/kitten';
```

---

## Complete Example

```javascript
import { getClient, logger } from '@shoru/kitten';

const { sock, id } = await getClient({
  id: 0,
  maxRetries: 15,
  onConnect: ({ client }) => {
    logger.info(`Session ${client.id} connected`);
  },
  onDisconnect: ({ message, recoverable }) => {
    logger.warn(`Disconnected: ${message} (recoverable: ${recoverable})`);
  }
});

logger.info(`Running as session ${id}`);
```

---

<div align="center">

</br>

**Made with ❤️ for Whatsapp Community by [Aymane Shoru](https://github.com/Mangaka-bot)**

</div>