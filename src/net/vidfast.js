import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
const TMO = 2500
const routesPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../capture/routes.json')

let cfg = null

function routes() {
  if (cfg) return cfg
  cfg = JSON.parse(fs.readFileSync(routesPath, 'utf8'))
  return cfg
}

function postPath(data) {
  const { probePrefix, streamPrefixB } = routes()
  return `${probePrefix}/${streamPrefixB}/${data}`.replace(/\/+/g, '/').replace(/^\//, '')
}

export async function postStream(data, page) {
  const { origin, csrfHeaders } = routes()
  const res = await fetch(`${origin}/${postPath(data)}`, {
    method: 'POST',
    headers: {
      ...csrfHeaders,
      'User-Agent': UA,
      Origin: origin,
      Referer: `${origin}${page}`,
    },
    signal: AbortSignal.timeout(TMO),
  })
  const text = (await res.text()).trim()
  if (!res.ok || !text || text.startsWith('{')) return null
  return text
}
