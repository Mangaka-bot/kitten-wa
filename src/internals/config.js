import { cosmiconfig } from 'cosmiconfig';
import { defu } from 'defu';

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
    const result = await explorer.search();
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
  
  return defu(userConfig, defaultConfig);
};

let cachedConfig = null;

export const getConfig = async () => {
  if (!cachedConfig) {
    cachedConfig = Object.freeze(await loadConfig());
  }
  return cachedConfig;
};