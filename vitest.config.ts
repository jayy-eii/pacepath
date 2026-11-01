import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      env: {
        VITE_SUPABASE_URL: '',
        VITE_SUPABASE_ANON_KEY: '',
      },
      setupFiles: ['./src/test/setup.ts'],
    },
  }),
)
