import { serveStatic } from './static.js'
import { relayHlsStream } from '../relay/hls.js'
import { parseResolveInput } from '../resolve/input.js'
import { stream } from '../resolve/stream.js'

const cors = { 'Access-Control-Allow-Origin': '*' }

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...cors })
  res.end(JSON.stringify(body))
}

async function ndjson(res, generator) {
  res.writeHead(200, {
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
    ...cors,
  })
  res.flushHeaders?.()
  for await (const event of generator) {
    await new Promise((resolve, reject) => {
      res.write(`${JSON.stringify(event)}\n`, (error) => (error ? reject(error) : resolve()))
    })
  }
  res.end()
}

export async function route(req, res) {
  if (!req.headers.host) {
    res.writeHead(400, { 'Content-Type': 'text/plain' })
    res.end('missing host')
    return
  }

  const { pathname, searchParams, origin } = new URL(req.url ?? '/', `http://${req.headers.host}`)

  if (pathname === '/api/hls') {
    const target = searchParams.get('url')
    if (!target) return json(res, 400, { error: 'url required' })
    try {
      const out = await relayHlsStream(target, `${origin}/api/hls`)
      res.writeHead(out.status, out.headers)
      res.end(out.body)
    } catch (error) {
      json(res, 502, { error: String(error.message || error) })
    }
    return
  }

  if (pathname === '/api/resolve') {
    try {
      await ndjson(
        res,
        stream(
          parseResolveInput({
            type: searchParams.get('type'),
            id: searchParams.get('id'),
            season: searchParams.get('season'),
            episode: searchParams.get('episode'),
          }),
          origin,
        ),
      )
    } catch (error) {
      json(res, 400, { ok: false, stage: 'input', error: String(error.message || error) })
    }
    return
  }

  if (serveStatic(pathname, res)) return

  res.writeHead(404, { 'Content-Type': 'text/plain' })
  res.end('not found')
}
