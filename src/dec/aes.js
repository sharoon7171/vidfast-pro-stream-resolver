import crypto from 'node:crypto'

const HDR = 16
const IV = 12
const TAG = 16
const SKIP = 8

function key(header, keys) {
  const h = crypto.createHash('sha256').update(keys.k1).update(keys.k2).update(keys.k3).digest()
  return crypto.createHash('sha256').update(h).update(header).digest()
}

export function decJson(b64, keys) {
  const raw = Buffer.from(b64, 'base64')
  const min = HDR + IV + TAG + SKIP + 1
  if (raw.length < min) throw new Error('blob too short')
  const header = raw.subarray(0, HDR)
  const iv = raw.subarray(HDR, HDR + IV)
  const tag = raw.subarray(raw.length - TAG)
  const enc = raw.subarray(HDR + IV, raw.length - TAG)
  const d = crypto.createDecipheriv('aes-256-gcm', key(header, keys), iv)
  d.setAuthTag(tag)
  const plain = Buffer.concat([d.update(enc), d.final()])
  return JSON.parse(plain.subarray(SKIP).toString('utf8'))
}
