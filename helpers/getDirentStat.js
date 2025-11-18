import { stat } from "fs/promises";

export const getDirentStat = async (path) => {
  try {
    const stats = await stat(path);
    if (stats.isDirectory()) return "dir";
    if (stats.isFile()) return "file";
  } catch (e) {
    if (e.code === "ENOENT") return "deleted";
    console.log(`[Dirent Stat ERR] for ${path}`);
    console.error(e)
    return "";
  }
};