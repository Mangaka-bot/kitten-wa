import { watch } from "fs";
import { join, sep } from "path";
import { loader } from "@shoru/listrx";
import { initPlugins } from "./initPlugins.js";
import { debounce, fetchFile, fetchFolder, getDirentStat } from "#helpers.js";
import { addPlugins, removePluginsByFile, removePluginsByFolder } from "./plugins-manager.js"

const { HMR_TIMEOUT, PLUGINS_DIR, DEFAULT_TAG } = globalThis;

await initPlugins();

const spinner = loader("Changes detected, reloading plugins...");

const debouncedReload = debounce(async (direntName) => {
  if (!direntName) return;

  const fullPath = join(PLUGINS_DIR, direntName);
  const direntStat = await getDirentStat(fullPath);

  switch (direntStat) {
    case "deleted": {
      spinner.start();
      removePluginsByFile(fullPath);
      removePluginsByFolder(fullPath);
      spinner.succeed(`[${direntName}] Removed`);
      return;
    };
    case "dir": {
      spinner.start();
      removePluginsByFolder(fullPath);
      const items = await fetchFolder(fullPath);
      if (items.length === 0) return spinner.stop();
      addPlugins(items);
      spinner.succeed(`[${direntName}] reloaded`);
      return;
    };
    case "file": {
      if (!direntName?.endsWith(".js")) return;
      spinner.start();
      removePluginsByFile(fullPath);
      const pathParts = direntName.split(sep);
      const tag = pathParts.length > 1 ? pathParts[0] : DEFAULT_TAG;
      const items = await fetchFile(fullPath, tag);
      if (items.length === 0) return spinner.stop();
      addPlugins(items);
      spinner.succeed(`[${direntName}] reloaded`);
      return;
    };
    case "error": return;
  }
}, HMR_TIMEOUT)

watch(
  PLUGINS_DIR, 
  { recursive: true },
  (_, direntName) => debouncedReload(direntName)
)