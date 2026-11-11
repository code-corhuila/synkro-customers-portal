import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'node', globals: true, fileParallelism: false, globalSetup: ['tests/pact/clean.ts'],
  include: ['tests/pact/*.test.ts'], testTimeout: 30000 } });
