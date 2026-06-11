import { decJson } from './aes.js'

export function decStream(b64, keys) {
  const json = decJson(b64, keys)
  if (!json.url) throw new Error('stream missing url')
  return json.url
}
