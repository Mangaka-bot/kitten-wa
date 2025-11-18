import { sep } from "path"

export const addPlugins = (items) => {
  if (!items) return;
  const plugins = items.filter(i => !i.isAuto);
  const autoPlugins = items.filter(i => i.isAuto);

  if (globalThis.PLUGINS && globalThis.AUTOPLUGINS) {
    plugins.forEach(i => globalThis.PLUGINS.set(i.pluginId, i));
    autoPlugins.forEach(i => globalThis.AUTOPLUGINS.set(i.pluginId, i));
  } else {
    globalThis.PLUGINS = new Map(plugins.map(i => [i.pluginId, i]))
    globalThis.AUTOPLUGINS = new Map(autoPlugins.map(i => [i.pluginId, i]))
  }
}

const _removePluginsWhere = (condition) => {
  globalThis.PLUGINS.forEach((plugin, pluginId) => {
    if (condition(plugin))
      globalThis.PLUGINS.delete(pluginId);
  })
  
  globalThis.AUTOPLUGINS.forEach((plugin, pluginId) => {
    if (condition(plugin))
      globalThis.AUTOPLUGINS.delete(pluginId);
  })
}

export const removePluginsByFile = (filePath) => {
  _removePluginsWhere(plugin => plugin.sourceFile === filePath)
}

export const removePluginsByFolder = (folderPath) => {
  const pathPrefix = `${folderPath}${sep}`;
  _removePluginsWhere(plugin => plugin.sourceFile.startsWith(pathPrefix))
}