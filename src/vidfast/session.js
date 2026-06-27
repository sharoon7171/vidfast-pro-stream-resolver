import { playerCsrfToken, vidfastOrigin } from '../env.js'
import { isPlayerApiUrl } from '../player/runtime.js'
import { mergeHeaders, storeCookies } from './headers.js'

export function createPlayerFetch(referer, cookies) {
  const nativeFetch = globalThis.fetch.bind(globalThis)
  return async (input, init = {}) => {
    const url = String(input).startsWith('http') ? String(input) : `${vidfastOrigin}${input}`
    const headers = mergeHeaders(referer, init.headers, cookies)
    if (isPlayerApiUrl(url)) {
      headers.set('accept', '*/*')
      headers.set('x-csrf-token', playerCsrfToken)
      headers.set('x-requested-with', 'XMLHttpRequest')
    }
    const response = await nativeFetch(url, { ...init, headers })
    storeCookies(response, cookies)
    return response
  }
}
