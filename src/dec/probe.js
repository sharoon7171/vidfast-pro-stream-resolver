import { decJson } from './aes.js'

function rows(json) {
  if (Array.isArray(json)) return json
  if (Array.isArray(json.servers)) return json.servers
  throw new Error('probe has no servers')
}

export function decProbe(b64, keys) {
  const list = rows(decJson(b64, keys))
  if (!list.length) throw new Error('probe empty')
  return list.map((row, i) => {
    const name = row.name || row.server
    if (!name) throw new Error(`probe[${i}] no name`)
    const data = row.data ?? row.id
    if (data === undefined) throw new Error(`probe[${i}] no data`)
    return { name, data, description: row.description || '', image: row.image || '' }
  })
}
