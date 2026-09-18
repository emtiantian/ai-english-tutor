import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { resolve } from 'path'

export default defineConfig({
  // 与后端 config.ts 保持一致：从仓库根读 .env，前后端共用一份配置
  envDir: resolve(__dirname, '../..'),
  plugins: [
    // HTTPS for local dev — required for iOS Safari microphone access
    basicSsl(),
    vue(),
    UnoCSS()
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@framework': resolve(__dirname, 'src/lib/cubism-framework')
    }
  },
  server: {
    host: '0.0.0.0',
    port: 6173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  },
  preview: {
    host: '0.0.0.0',
    port: 4173
  }
})
