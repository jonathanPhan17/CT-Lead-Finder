import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    open: true,
    proxy: {
      '/nominatim-proxy': {
        target: 'https://nominatim.openstreetmap.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/nominatim-proxy/, ''),
        headers: {
          'User-Agent': 'ClinicalTrialsLeadTool/1.0',
          'Accept-Language': 'en',
        },
      },
      '/ct-proxy': {
        target: 'https://clinicaltrials.gov',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ct-proxy/, ''),
        headers: {
          'Accept': 'application/json',
        },
      },
    },
  },
})
