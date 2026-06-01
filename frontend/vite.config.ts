import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const API_TARGET = process.env.API_PROXY_TARGET || 'http://localhost:3000'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: ['frontend', 'localhost'],
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
      },
      '/screenshots': {
        target: API_TARGET,
        changeOrigin: true,
      },
      '/reports': {
        target: API_TARGET,
        changeOrigin: true,
      },
    },
  },
})
