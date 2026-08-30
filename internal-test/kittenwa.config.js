import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pluginsDir = path.resolve(__dirname, 'plugins');

const db = {
  path: path.resolve(__dirname, 'db'),
  compression: true,
  mapSize: 2 * 1024 * 1024 * 1024, // 2 GB
  maxReaders: 126,
  noSync: false,
  noMetaSync: false,
};

const plugins = {
  dir: pluginsDir,
  prefixes: ['.', '\\', '!'],
  defaultEvent: 'messages.upsert',
  hmr: {
    enable: true,
    debounce: 200,
    debug: true
  }
}

export default {
  db,
  plugins,
  timeZone: 'Africa/Casablanca'
}