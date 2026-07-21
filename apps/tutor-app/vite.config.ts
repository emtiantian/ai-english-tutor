import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { resolve } from 'path'

export default defineConfig({
  // 与后端 config.ts 保持一致：从仓库根读 .env，前后端共用一份配置
  envDir: resolve(__dirname, '../..'),
  plugins: [
    // HTTPS for local dev — required for iOS Safari microphone access
    basicSsl(),
    vue(),
    UnoCSS(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'AI English Tutor',
        short_name: 'English Tutor',
        description: 'Learn English with AI-powered conversations',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,svg,woff2}'],
        // Live2D 模型素材(textures、moc3、motion3.json 等)体积大且按需加载,
        // 不进 precache(下面 runtimeCaching 已经把 /models/* 走 CacheFirst 了)。
        // 注意:此处 glob 是相对 dist/ 的,所以前缀不带 /
        globIgnores: ['**/models/**'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5MB (Live2D textures)
        runtimeCaching: [
          {
            urlPattern: /^https?:\/\/.*\/api\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 3600 }
            }
          },
          {
            urlPattern: /\/models\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'model-cache',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 30 }
            }
          },
          {
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'cdn-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 30 }
            }
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@framework': resolve(__dirname, 'src/lib/cubism-framework')
    }
  },
  define: {
    'process.env': {}
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
