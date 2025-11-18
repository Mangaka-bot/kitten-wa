import { join, basename, parse } from "path";
import { readdir } from "fs/promises";
import { pathToFileURL } from "url";

const _assign = (item, tag, sourceFile) => {
  const fileName = parse(basename(sourceFile)).name;
  item.tag = tag;
  item.pluginId = `${tag}/${fileName}/${item.name}`;
  item.sourceFile = sourceFile;
  if (!item.command)
    item.isAuto = true;
  return item
}

export const fetchFile = async (filePath, tag) => {
  const fileURL = `${pathToFileURL(filePath).href}?update=${Date.now()}`;
  const items = await import(fileURL).catch(() => []);
  return Object.values(items)
    .filter(item => typeof item === "function")
    .map(i => _assign(i, tag, filePath))
    .filter(Boolean);
}

export const fetchFolder = async (folderPath) => {
  const tag = basename(folderPath);
  const dir = await readdir(folderPath, { withFileTypes: true });

  const promises = dir
    .filter(d => !d.isDirectory() && d.name.endsWith(".js"))
    .map(f => fetchFile(join(folderPath, f.name), tag))

  return (await Promise.all(promises)).flat();
}