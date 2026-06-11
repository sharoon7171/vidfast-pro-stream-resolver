import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { warm } from '../capture/init.js'
import { proxyHls } from '../net/hls.js'
import { runResolve } from '../resolve/run.js'

const PORT = Number(process.env.PORT || 8787)
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const index = path.join(root, 'public/index.html')

function json(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
  res.end(JSON.stringify(body))
}

function ndjson(res, evt) {
  return new Promise((ok, err) => {
    res.write(`${JSON.stringify(evt)}\n`, (e) => (e ? err(e) : ok()))
  })
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`)

  if (url.pathname === '/api/hls') {
    const target = url.searchParams.get('url')
    if (!target) return json(res, 400, { error: 'url required' })
    try {
      const out = await proxyHls(target, `${url.origin}/api/hls`)
      res.writeHead(out.status, out.headers)
      res.end(out.body)
    } catch (e) {
      json(res, 502, { error: String(e.message || e) })
    }
    return
  }

  if (url.pathname === '/api/resolve') {
    res.writeHead(200, {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': '*',
    })
    res.flushHeaders?.()
    try {
      for await (const evt of runResolve(url.searchParams, url.origin)) {
        await ndjson(res, evt)
      }
      res.end()
    } catch (e) {
      if (!res.headersSent) {
        json(res, 400, { error: String(e.message || e) })
        return
      }
      res.write(`${JSON.stringify({ event: 'error', error: String(e.message || e) })}\n`)
      res.end()
    }
    return
  }

  if (url.pathname === '/' || url.pathname === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    fs.createReadStream(index).pipe(res)
    return
  }

  res.writeHead(404)
  res.end('not found')
}).listen(PORT, () => {
  warm()
  console.log(`http://127.0.0.1:${PORT}`)
})
