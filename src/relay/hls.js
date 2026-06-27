import { Buffer } from 'node:buffer'
import { userAgent, vidfastOrigin } from '../env.js'

function stripTransportStreamPrefix(buffer) {
  if (buffer.length < 4) return buffer
  if (buffer[0] === 0x47) return buffer
  if (buffer[0] !== 0x89 || buffer[1] !== 0x50 || buffer[2] !== 0x4e || buffer[3] !== 0x47) return buffer
  const iend = buffer.indexOf(Buffer.from('IEND'))
  if (iend >= 0 && iend + 8 < buffer.length) return buffer.subarray(iend + 8)
  for (let i = 0; i < Math.min(buffer.length, 65536); i++) {
    if (buffer[i] === 0x47 && i + 188 < buffer.length && buffer[i + 188] === 0x47) return buffer.subarray(i)
  }
  return buffer
}

function rewritePlaylistUrls(text, baseUrl, relayBase) {
  return text.split('\n').map((line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return line
    return `${relayBase}?url=${encodeURIComponent(new URL(trimmed, baseUrl).href)}`
  }).join('\n')
}

function isPlaylistResponse(url, contentType, text) {
  const path = new URL(url).pathname.toLowerCase()
  return (
    contentType.includes('mpegurl') ||
    contentType.includes('m3u8') ||
    path.endsWith('.m3u8') ||
    text.startsWith('#EXTM3U')
  )
}

export async function relayHlsStream(url, relayBase) {
  const response = await fetch(url, {
    headers: { Referer: `${vidfastOrigin}/`, Origin: vidfastOrigin, 'User-Agent': userAgent },
    redirect: 'follow',
  })
  if (!response.ok) throw new Error(`upstream ${response.status}`)

  const contentType = response.headers.get('content-type') || ''
  const raw = Buffer.from(await response.arrayBuffer())

  if (isPlaylistResponse(url, contentType, raw.toString('utf8', 0, Math.min(raw.length, 16)))) {
    return {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache',
      },
      body: rewritePlaylistUrls(raw.toString('utf8'), url, relayBase),
    }
  }

  return {
    status: 200,
    headers: {
      'Content-Type': contentType || 'application/octet-stream',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600',
    },
    body: stripTransportStreamPrefix(raw),
  }
}
