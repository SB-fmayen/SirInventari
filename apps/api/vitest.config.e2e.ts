import { defineConfig } from 'vitest/config';

// Pruebas e2e: necesitan la base de Docker encendida (docker compose up -d)
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    setupFiles: ['./test/preparar-entorno.ts'],
    fileParallelism: false,
  },
});
