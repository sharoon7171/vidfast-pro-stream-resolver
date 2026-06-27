import { createReadStream } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const publicRoot = join(root, '../../public')
const hlsModule = join(root, '../../node_modules/hls.js/dist/hls.mjs')

const assets = {
  '/': [join(publicRoot, 'index.html'), 'text/html; charset=utf-8'],
  '/index.html': [join(publicRoot, 'index.html'), 'text/html; charset=utf-8'],
  '/style.css': [join(publicRoot, 'style.css'), 'text/css; charset=utf-8'],
  '/player.js': [join(publicRoot, 'player.js'), 'application/javascript; charset=utf-8'],
  '/vendor/hls.mjs': [hlsModule, 'application/javascript; charset=utf-8'],
}

export function serveStatic(pathname, res) {
  const asset = assets[pathname]
  if (!asset) return false
  res.writeHead(200, { 'Content-Type': asset[1], 'Cache-Control': 'no-store' })
  createReadStream(asset[0]).pipe(res)
  return true
}
