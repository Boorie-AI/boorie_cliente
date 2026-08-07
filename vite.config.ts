/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  base: './', // Use relative paths for assets
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@/components': path.resolve(__dirname, './src/components'),
      '@/services': path.resolve(__dirname, './src/services'),
      '@/stores': path.resolve(__dirname, './src/stores'),
      '@/types': path.resolve(__dirname, './src/types'),
      '@/utils': path.resolve(__dirname, './src/utils'),
    },
  },
  define: {
    global: 'globalThis',
  },
  server: {
    port: 3000,
    watch: {
      // Nada de esto es fuente del frontend, y vigilarlo agota
      // fs.inotify.max_user_watches (65536 aquí): venv-wntr solo ya son
      // ~21k archivos. Al pasarse, chokidar emite ENOSPC y Vite muere al
      // arrancar, dejando un servidor huérfano sirviendo el puerto 3000.
      ignored: [
        '**/.git/**',
        '**/node_modules/**',
        '**/venv-wntr/**',
        '**/dist/**',
        '**/dist-electron/**',
        '**/test-files/**',
        '**/rag-knowledge/**',
        '**/data/**',
      ],
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'backend/**/*.{test,spec}.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}', 'backend/**/*.ts'],
      exclude: ['src/test/**', '**/*.d.ts', '**/types/**'],
    },
  },
})