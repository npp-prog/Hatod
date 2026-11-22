import { defineConfig } from 'vitest/config';

// Runs inside `firebase emulators:exec` (see npm run test:emulator).
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
