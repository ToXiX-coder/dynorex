// Default Expo config. While Buildmark lives inside the Dynorex folder without its own node_modules, it borrows
// the parent's packages; once it has its own `npm install`, this falls back to the plain default.
const fs = require("node:fs");
const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

if (!fs.existsSync(path.join(projectRoot, "node_modules", "expo"))) {
  const parentModules = path.resolve(projectRoot, "..", "node_modules");
  config.watchFolders = [parentModules];
  config.resolver.nodeModulesPaths = [parentModules];
}

module.exports = config;
