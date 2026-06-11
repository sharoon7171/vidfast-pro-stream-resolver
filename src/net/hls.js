import { Buffer } from 'node:buffer'

const ORIGIN = 'https://vidfast.pro'
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

function stripTs(buf) {
  if (buf.length < 4) return buf
  if (buf[0] === 0x47) return buf
  if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) return buf
  const iend = buf.indexOf(Buffer.from('IEND'))
  if (iend >= 0 && iend + 8 < buf.length) return buf.subarray(iend + 8)
  for (let i = 0; i < Math.min(buf.length, 65536); i++) {
    if (buf[i] === 0x47 && i + 188 < buf.length && buf[i + 188] === 0x47) return buf.subarray(i)
  }
  return buf
}

function rewriteM3u8(text, base, proxy) {
  return text.split('\n').map((line) => {
    const t = line.trim()
    if (!t || t.startsWith('#')) return line
    return `${proxy}?url=${encodeURIComponent(new URL(t, base).href)}`
  }).join('\n')
}

export async function proxyHls(url, proxy) {
  const res = await fetch(url, {
    headers: { Referer: `${ORIGIN}/`, Origin: ORIGIN, 'User-Agent': UA },
    redirect: 'follow',
  })
  if (!res.ok) throw new Error(`upstream ${res.status}`)

  const path = new URL(url).pathname.toLowerCase()
  const type = res.headers.get('content-type') || ''
  const m3u8 = type.includes('mpegurl') || type.includes('m3u8') || path.endsWith('.m3u8')

  if (m3u8) {
    return {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache',
      },
      body: rewriteM3u8(await res.text(), url, proxy),
    }
  }

  return {
    status: 200,
    headers: {
      'Content-Type': res.headers.get('content-type') || 'application/octet-stream',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600',
    },
    body: stripTs(Buffer.from(await res.arrayBuffer())),
  }
}
