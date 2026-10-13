import { defineConfig } from 'vitest/config';
export default defineConfig({test: { coverage: {
  provider: 'v8', reporter: ['text', 'json-summary', 'lcov'],
  thresholds: { statements: 70, 'src/app/**/*.component.ts': { statements: 70 }, 'src/app/**/*.service.ts': { statements: 70 } }
}}});
