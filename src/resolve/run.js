import { listProbe, urlFromBlob } from '../capture/init.js'
import { postStream } from '../net/vidfast.js'
import { pool } from './pool.js'

const WORKERS = 8

function page(params) {
  const type = params.get('type') || 'movie'
  const id = params.get('id')?.trim()
  if (!id) throw new Error('id required')
  if (type === 'tv') {
    const season = params.get('season')?.trim()
    const episode = params.get('episode')?.trim()
    if (!season || !episode) throw new Error('season and episode required')
    return `/tv/${id}/${season}/${episode}`
  }
  return `/movie/${id}`
}

function pack(row, url, origin) {
  return {
    name: row.name,
    description: row.description,
    image: row.image,
    data: row.data,
    streamUrl: url,
    playbackUrl: `${origin}/api/hls?url=${encodeURIComponent(url)}`,
  }
}

async function urlFor(row, pagePath) {
  let b64 = null
  try {
    b64 = await postStream(row.data, pagePath)
  } catch {
    return null
  }
  if (!b64) return null
  try {
    return urlFromBlob(b64)
  } catch {
    return null
  }
}

export async function* runResolve(params, origin) {
  const pagePath = page(params)
  const probe = listProbe()
  const seen = new Set()
  const out = []

  yield {
    event: 'meta',
    ok: true,
    type: params.get('type') || 'movie',
    contentPath: pagePath,
    total: probe.length,
  }

  for await (const hit of pool(probe, (row) => urlFor(row, pagePath), WORKERS)) {
    const url = hit.value
    if (!url || seen.has(url)) continue
    seen.add(url)
    const server = pack(hit.item, url, origin)
    out.push(server)
    yield { event: 'server', server }
  }

  if (!out.length) throw new Error('no available servers')

  yield { event: 'done', ok: true, servers: out, activeIndex: 0, contentPath: pagePath }
}
