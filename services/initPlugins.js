import { readdir } from "fs/promises";
import { join } from "path";
import config from "config"
import { fetchFile, fetchFolder } from "#helpers.js";
import { addPlugins } from "./plugins-manager.js";

const {
  dir: pluginsDir,
  defaultTag,
} = config.plugins;

export const initPlugins = async () => {
  const dir = await readdir(pluginsDir, { withFileTypes: true });
  
  const filesPromises = dir
    .filter(d => !d.isDirectory() && d.name.endsWith(".js"))
    .flatMap(f => fetchFile(join(pluginsDir, f.name), defaultTag))

  const foldersPromises = dir
    .filter(d => d.isDirectory())
    .flatMap(d => fetchFolder(join(pluginsDir, d.name)))
  
  const items = (await Promise.all([...filesPromises, ...foldersPromises]))
  .flat(Infinity)
  .filter(Boolean)

  addPlugins(items);
};