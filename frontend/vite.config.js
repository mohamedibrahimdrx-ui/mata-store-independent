import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Local development: the frontend calls same-origin "/api/..." and Vite forwards it to the local backend
    // (cd backend && npm run dev). In production on Vercel, /api is served by the Vercel Function instead.
    proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: true } },
  },
})
