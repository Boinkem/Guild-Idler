import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: {
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
});
