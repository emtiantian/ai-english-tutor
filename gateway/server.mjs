/**
 * Lightweight Node.js dev gateway
 *
 * Proxies /api/* to the backend with CORS headers.
 * Supports SSE streaming for /api/chat/stream.
 *
 * Usage: node gateway/server.mjs [port] [backend_url]
 * Default: port=6000, backend=http://localhost:3000
 */

import http from 'node:http'

const GATEWAY_PORT = parseInt(process.argv[2] || '6000', 10)
const BACKEND_URL = process.argv[3] || 'http://localhost:3000'

const backend = new URL(BACKEND_URL)

const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, api-key')
  res.setHeader('Access-Control-Allow-Credentials', 'true')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  // Only proxy /api/* requests
  if (!req.url?.startsWith('/api')) {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Not found' }))
    return
  }

  const targetUrl = new URL(req.url, backend)

  const proxyReq = http.request(
    {
      hostname: backend.hostname,
      port: backend.port,
      path: targetUrl.pathname + targetUrl.search,
      method: req.method,
      headers: {
        ...req.headers,
        host: backend.host,
      },
    },
    (proxyRes) => {
      // Copy response headers (including SSE headers)
      const headers = { ...proxyRes.headers }
      headers['access-control-allow-origin'] = '*'
      res.writeHead(proxyRes.statusCode, headers)
      proxyRes.pipe(res, { end: true })
    },
  )

  proxyReq.on('error', (err) => {
    console.error(`[gateway] Proxy error: ${err.message}`)
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Backend unavailable' }))
    }
  })

  req.pipe(proxyReq, { end: true })
})

server.listen(GATEWAY_PORT, () => {
  console.log(`🚀 Gateway running on http://localhost:${GATEWAY_PORT}`)
  console.log(`   Proxying /api/* → ${BACKEND_URL}`)
})
