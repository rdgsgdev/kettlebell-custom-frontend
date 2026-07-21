// metro.config.js
//
// Standard Expo/Metro config plus a resolver override that keeps
// @callstack/liquid-glass from crashing the bundler on builds that don't run
// React Native Codegen (Expo SDK 51 / old architecture / Expo Go / web).
//
// The library's iOS entry imports a Codegen spec
// (LiquidGlassViewNativeComponent.ts) that Metro cannot parse without the New
// Architecture — it throws "Unknown prop type for effect: undefined". We
// intercept the bare package import and substitute a plain-View shim instead.
//
// When you upgrade to the New Architecture (Expo SDK 54+) and link the native
// module, DELETE the resolveRequest override below and the shim — the real
// library will load and GlassSurface will use the native effect automatically.

const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const SHIM_PATH = require('path').resolve(projectRoot, 'shims/liquid-glass-stub.ts');

const config = getDefaultConfig(projectRoot);

const STUB_PACKAGES = new Set(['@callstack/liquid-glass']);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Only rewrite a bare import of the package (not nested relative imports
  // inside it — those are already resolved once the entry is swapped).
  if (STUB_PACKAGES.has(moduleName) && context.originModulePath) {
    return {
      type: 'sourceFile',
      filePath: SHIM_PATH,
    };
  }
  // Fall back to Metro's default resolution for everything else.
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
