import { sep } from "path"

const pluginsMap = new Map();
const autoPluginsMap = new Map();

export const getPlugins = () => pluginsMap;
export const getAutoPlugins = () => autoPluginsMap;

export const addPlugins = (items) => {
  if (!items) return;
  const plugins = items.filter(i => !i.isAuto);
  const autoPlugins = items.filter(i => i.isAuto);

  plugins.forEach(i => pluginsMap.set(i.pluginId, i));
  autoPlugins.forEach(i => autoPluginsMap.set(i.pluginId, i));
}

const _removePluginsWhere = (condition) => {
  pluginsMap.forEach((plugin, pluginId) => {
    if (condition(plugin))
      pluginsMap.delete(pluginId);
  })
  
  autoPluginsMap.forEach((plugin, pluginId) => {
    if (condition(plugin))
      autoPluginsMap.delete(pluginId);
  })
}

export const removePluginsByFile = (filePath) => {
  _removePluginsWhere(plugin => plugin.sourceFile === filePath)
}

export const removePluginsByFolder = (folderPath) => {
  const pathPrefix = `${folderPath}${sep}`;
  _removePluginsWhere(plugin => plugin.sourceFile.startsWith(pathPrefix))
}