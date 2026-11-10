const fs = require("fs");
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, "..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [repoRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(repoRoot, "node_modules"),
];
config.resolver.extraNodeModules = {
  zod: path.resolve(projectRoot, "node_modules/zod"),
};

// Shared and server sources use Node ESM specifiers (./file.js) that point at TypeScript.
const previousResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith(".") && moduleName.endsWith(".js")) {
    const withoutJs = moduleName.slice(0, -3);
    const base = path.resolve(path.dirname(context.originModulePath), withoutJs);
    if (fs.existsSync(`${base}.ts`) || fs.existsSync(`${base}.tsx`)) {
      moduleName = withoutJs;
    }
  }
  if (typeof previousResolve === "function") return previousResolve(context, moduleName, platform);
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
