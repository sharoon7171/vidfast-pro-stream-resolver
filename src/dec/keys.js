import { Buffer } from 'node:buffer'

export function parseKeys(raw) {
  const s = raw?.stream
  if (!s?.k1 || !s?.k2 || !s?.k3) throw new Error('keys missing k1 k2 k3')
  return {
    k1: Buffer.from(s.k1, 'hex'),
    k2: Buffer.from(s.k2, 'hex'),
    k3: Buffer.from(s.k3, 'hex'),
  }
}
