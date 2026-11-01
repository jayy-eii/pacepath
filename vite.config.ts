import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
            return 'vendor-react'
          }
          if (id.includes('node_modules/react-router') || id.includes('node_modules/react-router-dom/')) {
            return 'vendor-router'
          }
          if (id.includes('node_modules/framer-motion/')) {
            return 'vendor-framer-motion'
          }
          if (id.includes('node_modules/dexie/')) {
            return 'vendor-dexie'
          }
        },
      },
    },
    chunkSizeWarningLimit: 650,
  },
})
