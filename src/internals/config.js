import { cosmiconfig } from 'cosmiconfig';
import { createDefu } from 'defu';
import path from 'path';

const mergeConfig = createDefu((obj, key, value) => {
  if (Array.isArray(value)) {
    obj[key] = value;
    return true;
  }
});

const loadDefaultConfig = async () => {
  try {
    const module = await import('../config/default.js');
    const defaultConfig = module?.default ?? module;

    if (typeof defaultConfig !== 'object' || defaultConfig === null || Array.isArray(defaultConfig)) {
      throw new Error(`[INTERNAL_CONFIG] default config must export an object`);
    }
    
    return defaultConfig;
  } catch (err) {
    throw new Error(`[INTERNAL_CONFIG] Error loading default config: ${err.message}`, { cause: err });
  }
};

const loadUserConfig = async () => {
  try {
    const explorer = cosmiconfig('kittenwa');
    const searchFrom = process.argv[1] ? path.dirname(path.resolve(process.argv[1])) : process.cwd();
    let result = await explorer.search(searchFrom);
    if (!result && searchFrom !== process.cwd()) {
      result = await explorer.search(process.cwd());
    }
    return result?.config ?? {};
  } catch (err) {
    throw new Error(`[USER_CONFIG] Error loading user config: ${err.message}`, { cause: err });
  }
};

export const loadConfig = async () => {
  const [userConfig, defaultConfig] = await Promise.all([
    loadUserConfig(),
    loadDefaultConfig()
  ]);
  
  return mergeConfig(userConfig, defaultConfig);
};

let cachedConfig = null;

export const getConfig = async () => {
  if (!cachedConfig) {
    cachedConfig = Object.freeze(await loadConfig());
  }
  return cachedConfig;
};