import { vidfastOrigin } from '../env.js'
import { mergeHeaders, storeCookies } from './headers.js'

const SESSION_TOKEN_PATTERN = /\\"en\\":\\"([^\\"]+)\\"/

function parsePlayerProps(raw) {
  const normalized = raw.replace(/\\"/g, '"').replace(/"\$undefined"/g, 'null')
  const json = normalized.startsWith('{') ? normalized : `{${normalized}}`
  return JSON.parse(json)
}

function extractPlayerProps(html) {
  const tokenMatch = html.match(SESSION_TOKEN_PATTERN)
  if (!tokenMatch?.[0]) throw new Error('session token not found in page payload')
  const tokenStart = html.indexOf(tokenMatch[0])
  const chunk = html.slice(tokenStart, tokenStart + 1500)
  const endMatch = chunk.match(/\\"server\\":(?:\\"[^\\"]*\\"|null)\}/)
  if (!endMatch) throw new Error('player props end not found')
  const tokenEnd = tokenStart + endMatch.index + endMatch[0].length
  return parsePlayerProps(`{${html.slice(tokenStart, tokenEnd - 1)}}`)
}

function playerPagePath(kind, id, { season, episode } = {}) {
  return kind === 'tv' ? `/tv/${id}/${season}/${episode}` : `/movie/${id}`
}

export async function fetchPlayerPage(kind, id, options = {}) {
  const path = playerPagePath(kind, id, options)
  const referer = `${vidfastOrigin}${path}`
  const cookies = new Map()
  const response = await fetch(referer, {
    headers: mergeHeaders(referer, { accept: 'text/html,application/xhtml+xml' }),
  })
  if (!response.ok) throw new Error(`page fetch failed: ${response.status}`)
  storeCookies(response, cookies)
  const props = extractPlayerProps(await response.text())
  return {
    sessionToken: props.en,
    props,
    meta: { title: props.title, year: props.year },
    type: kind,
    id,
    referer,
    cookies,
  }
}
