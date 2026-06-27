import { Buffer } from 'node:buffer'
import { userAgent, vidfastOrigin } from '../env.js'

const relayHeaders = {
  Referer: `${vidfastOrigin}/`,
  Origin: vidfastOrigin,
  'User-Agent': userAgent,
}

function sniffStreamFormat(text, contentType = '') {
  const ct = contentType.toLowerCase()
  const head = text.trimStart()
  if (ct.includes('mpegurl') || ct.includes('m3u8') || head.startsWith('#EXTM3U')) return 'hls'
  if (ct.includes('dash+xml') || head.startsWith('<?xml') || head.startsWith('<MPD')) return 'dash'
  return null
}

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
  return sniffStreamFormat(text, contentType) === 'hls' || new URL(url).pathname.toLowerCase().endsWith('.m3u8')
}

export async function probeStreamFormat(url) {
  const response = await fetch(url, { headers: relayHeaders, redirect: 'follow' })
  if (!response.ok) throw new Error(`probe failed: ${response.status}`)

  const reader = response.body.getReader()
  const { value } = await reader.read()
  await reader.cancel()

  if (!value?.length) throw new Error('probe empty')

  const format = sniffStreamFormat(
    Buffer.from(value).toString('utf8'),
    response.headers.get('content-type') || '',
  )
  if (!format) throw new Error('unknown stream format')
  return format
}

export async function relayHlsStream(url, relayBase) {
  const response = await fetch(url, {
    headers: relayHeaders,
    redirect: 'follow',
  })
  if (!response.ok) throw new Error(`upstream ${response.status}`)

  const contentType = response.headers.get('content-type') || ''
  const raw = Buffer.from(await response.arrayBuffer())
  const textHead = raw.toString('utf8', 0, Math.min(raw.length, 512))

  if (sniffStreamFormat(textHead, contentType) === 'dash') {
    return {
      status: 200,
      headers: {
        'Content-Type': 'application/dash+xml',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache',
      },
      body: raw.toString('utf8'),
    }
  }

  if (isPlaylistResponse(url, contentType, textHead)) {
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
