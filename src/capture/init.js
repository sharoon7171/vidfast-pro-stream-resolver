import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseKeys } from '../dec/keys.js'
import { decProbe } from '../dec/probe.js'
import { decStream } from '../dec/stream.js'

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../capture')
let mem = null

function load() {
  if (mem) return mem
  const keys = parseKeys(JSON.parse(fs.readFileSync(path.join(dir, 'keys.json'), 'utf8')))
  const probe = fs.readFileSync(path.join(dir, 'probe.b64'), 'utf8').trim()
  mem = { keys, probe }
  return mem
}

export function warm() {
  load()
}

export function listProbe() {
  const { keys, probe } = load()
  return decProbe(probe, keys)
}

export function urlFromBlob(b64) {
  return decStream(b64, load().keys)
}
