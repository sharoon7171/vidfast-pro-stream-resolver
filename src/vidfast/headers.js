import { userAgent, vidfastOrigin } from '../env.js'

export function mergeHeaders(referer, initHeaders, cookies) {
  const headers = new Headers(initHeaders)
  if (!headers.has('user-agent')) headers.set('user-agent', userAgent)
  headers.set('referer', referer)
  headers.set('origin', vidfastOrigin)
  if (cookies?.size) {
    const cookieHeader = [...cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ')
    if (cookieHeader) headers.set('cookie', cookieHeader)
  }
  return headers
}

function parseSetCookie(header, cookies) {
  if (!header) return
  for (const part of header.split(/,(?=\s*[^;,]+=[^;,]+)/)) {
    const segment = part.split(';')[0].trim()
    const eq = segment.indexOf('=')
    if (eq <= 0) continue
    cookies.set(segment.slice(0, eq), segment.slice(eq + 1))
  }
}

export function storeCookies(response, cookies) {
  parseSetCookie(response.headers.getSetCookie?.()?.join(',') ?? response.headers.get('set-cookie'), cookies)
}
