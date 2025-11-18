import { readdir } from "fs/promises";
import { join } from "path";
import { fetchFile, fetchFolder } from "#helpers.js";
import { addPlugins } from "./plugins-manager.js";

const { PLUGINS_DIR, DEFAULT_TAG } = globalThis;

export const initPlugins = async () => {
  const dir = await readdir(PLUGINS_DIR, { withFileTypes: true });
  
  const filesPromises = dir
    .filter(d => !d.isDirectory() && d.name.endsWith(".js"))
    .map(f => fetchFile(join(PLUGINS_DIR, f.name), DEFAULT_TAG))

  const foldersPromises = dir
    .filter(d => d.isDirectory())
    .map(d => fetchFolder(join(PLUGINS_DIR, d.name)))
  
  const items = (await Promise.all([...filesPromises, ...foldersPromises]))
  .flat(Infinity)
  .filter(Boolean)

  addPlugins(items);
};