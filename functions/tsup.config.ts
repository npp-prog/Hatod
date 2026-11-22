import { defineConfig } from 'tsup';

// @hatod/shared is a workspace package that is not published, so it is
// bundled into lib/index.js. Everything in package.json "dependencies" stays
// external and is installed by Cloud Build at deploy time.
export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'lib',
  format: ['cjs'],
  target: 'node22',
  platform: 'node',
  sourcemap: true,
  clean: true,
  noExternal: ['@hatod/shared'],
  external: ['firebase-admin', 'firebase-functions', 'zod'],
});
