import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';

/**
 * Patch 0438 -- `--mode demo` (npm run dev:demo / build:demo /
 * package:demo) compiles the Steam demo build: `__GUILDBOUND_DEMO__` is
 * true in both the renderer and the Electron main process. Every other
 * mode compiles it false. See src/game/demo.ts for what the flag gates.
 */
export default defineConfig(({ mode }) => {
  const demoDefine = { __GUILDBOUND_DEMO__: JSON.stringify(mode === 'demo') };
  return {
    base: './',
    define: demoDefine,
    plugins: [
      react(),
      electron({
        main: {
          entry: 'electron/main.ts',
          vite: {
            // Main is built as its own Vite sub-build, which doesn't inherit
            // the top-level `define` -- passed through explicitly.
            define: demoDefine,
            build: {
              // steamworks.js ships a platform-conditional `require()` of a
              // prebuilt native .node binary (see its own index.js) -- Rollup
              // tries to statically parse whichever binary that require()
              // resolves to as JS source and fails outright (hit this for
              // real running a production build: "Unexpected character").
              // Marking it external keeps the require() as a genuine runtime
              // call instead, which is required for any native addon in a
              // bundler, not something specific to this library.
              rollupOptions: { external: ['steamworks.js'] },
            },
          },
        },
        preload: { input: 'electron/preload.ts' },
      }),
    ],
    build: { outDir: 'dist', emptyOutDir: true },
  };
});
