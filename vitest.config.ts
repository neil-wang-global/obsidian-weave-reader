import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';

export default defineConfig({
  plugins: [
    svelte({
      compilerOptions: {
        runes: true,
        compatibility: {
          componentApi: 4
        }
      }
    }),
    svelteTesting()
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    clearMocks: true,
    restoreMocks: true,
    setupFiles: ['./src/tests/setup.ts', './src/tests/vitest-setup.ts'],
    include: [
      'src/components/epub/**/*.test.ts',
      'src/components/ui/**/*.test.ts',
      'src/components/settings/**/*.test.ts',
      'src/views/**/*.test.ts',
      'src/services/epub/__tests__/**/*.{test,spec}.{js,ts}',
      'src/utils/__tests__/source-path-matcher.epub-links.test.ts',
      'src/utils/__tests__/yaml-utils.epub-source.test.ts',
      'src/utils/__tests__/license-sync-bridge.test.ts',
      'src/utils/__tests__/license-state.test.ts',
      'src/utils/__tests__/plugin-license.test.ts',
      'src/utils/__tests__/mobile-edit-viewport.test.ts',
      'src/utils/__tests__/mobile-floating-viewport.test.ts',
      'src/utils/__tests__/mobile-reading-viewport-lock.test.ts'
    ],
    exclude: ['node_modules', 'dist'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/tests/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/demo/**',
        '**/mocks/**'
      ]
    },
    server: {
      deps: {
        inline: ['svelte']
      }
    }
  },
  resolve: {
    alias: {
      '@': '/src',
      'obsidian': '/src/tests/mocks/obsidian.ts'
    }
  },
  define: {
    global: 'globalThis'
  }
});
