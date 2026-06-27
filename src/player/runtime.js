import fs from 'node:fs'
import vm from 'node:vm'
import { Buffer } from 'node:buffer'
import { fileURLToPath } from 'node:url'
import { patchPlayerChunk, createNativeConsole } from './patch.js'
import { createSandbox, createModuleStubs } from './sandbox.js'

const chunkDir = fileURLToPath(new URL('../../vendor/chunks', import.meta.url))
const RESOLVE_TIMEOUT_MS = 45000
const BUNDLE_API_PREFIX_INDEX = 1790
const BUNDLE_STREAM_SEGMENT_INDEX = 1368
const BUNDLE_STREAM_SEGMENT_SALT = 'Ygei'

const modules = {}
const moduleCache = {}
let sandbox = null
let cryptoModule = null
let playerBuffer = null
let playerApiPrefix = null

function defineExports(exports, map) {
  for (const [key, value] of Object.entries(map)) {
    Object.defineProperty(exports, key, {
      enumerable: true,
      get: typeof value === 'function' ? value : () => value,
    })
  }
}

function webpackRequire(id) {
  if (moduleCache[id]) return moduleCache[id].exports
  if (!modules[id]) throw new Error(`missing module ${id}`)
  const mod = { exports: {} }
  moduleCache[id] = mod
  const req = Object.assign((rid) => webpackRequire(rid), {
    d: defineExports,
    bind: (target, ...args) => target.bind(...args),
    g: sandbox,
  })
  modules[id](mod, mod.exports, req)
  return mod.exports
}

function loadChunk(filename, transform) {
  let code = fs.readFileSync(`${chunkDir}/${filename}`, 'utf8')
  if (transform) code = transform(code)
  const queue = []
  sandbox.webpackChunk_N_E = queue
  vm.runInContext(code, sandbox, { filename, timeout: 120000 })
  if (queue.length) Object.assign(modules, queue.shift()[1])
}

function requirePlayerExport(name) {
  ensurePlayerReady()
  const fn = sandbox[name]
  if (typeof fn !== 'function') throw new Error(`${name} player export not loaded`)
  return fn
}

function requirePlayerRoute(name) {
  ensurePlayerReady()
  const value = sandbox[name]
  if (typeof value !== 'string' || !value) throw new Error(`${name} player route not loaded`)
  return value
}

function ensurePlayerReady() {
  if (sandbox) return
  sandbox = createSandbox()
  modules['5376'] = (mod) => {
    mod.exports = { Buffer }
  }
  modules['7358'] = (mod) => {
    mod.exports = { env: {}, versions: { chrome: '122.0.0.0' }, browser: true }
  }
  modules['1590'] = (mod) => {
    mod.exports = vm
  }
  loadChunk('chunk-213.js')
  loadChunk('chunk-aaea2bcf.js')
  for (const [id, exp] of Object.entries(createModuleStubs(sandbox))) {
    modules[id] = (mod, exports, req) => {
      mod.exports = exp
      if (req?.d) req.d(exports, { default: () => exp, __esModule: () => true })
    }
  }
  loadChunk('chunk-365.js', patchPlayerChunk)
  webpackRequire('9987')
  cryptoModule = webpackRequire('3018')
  playerBuffer = cryptoModule.randomBytes(1).constructor
  sandbox.__playerApiPrefix = requirePlayerExport('__playerDecodeUnsalted')(BUNDLE_API_PREFIX_INDEX)
  sandbox.__playerStreamSegment = requirePlayerExport('__playerDecodeSalted')(
    BUNDLE_STREAM_SEGMENT_INDEX,
    BUNDLE_STREAM_SEGMENT_SALT,
  )
  playerApiPrefix = sandbox.__playerApiPrefix
}

export function isPlayerApiUrl(url) {
  if (!playerApiPrefix) throw new Error('player API prefix not loaded')
  return String(url).includes(playerApiPrefix)
}

function buildStreamRequestPath(server) {
  if (!server?.data) throw new Error('server missing data token')
  const apiPrefix = requirePlayerRoute('__playerApiPrefix')
  const streamSegment = requirePlayerRoute('__playerStreamSegment')
  return `${apiPrefix}/${streamSegment}/${server.data}`.replace(/\/+/g, '/')
}

async function decryptStreamUrl(body, playerContext) {
  const decrypted = []
  await requirePlayerExport('__playerDecrypt')({ ...playerContext, dr: decrypted, rs: body })
  if (decrypted[0] == null) throw new Error('decrypt failed')
  if (!decrypted[0]?.url) throw new Error('decrypt missing stream url')
  return decrypted[0].url
}

export async function openServerStream(server, playerFetch, playerContext) {
  const response = await playerFetch(buildStreamRequestPath(server), {
    method: 'POST',
    body: '',
  })
  if (!response.ok) throw new Error(`stream failed: ${response.status}`)
  const url = await decryptStreamUrl((await response.text()).trim(), { ...playerContext, server })
  return { url }
}

function buildPlayerContext(sessionToken, ctx, hooks) {
  if (!ctx.props?.host) throw new Error('host missing from page props')
  if (!ctx.referer) throw new Error('referer missing')
  const host = ctx.props.host
  sandbox.location.href = ctx.referer

  return {
    crypto: cryptoModule,
    encode: requirePlayerExport('__playerEncode'),
    en: sessionToken,
    server: ctx.server ?? null,
    setServers: hooks.setServers,
    setState: hooks.setState,
    setFavServer: hooks.setFavServer,
    window: sandbox,
    document: sandbox.document,
    navigator: sandbox.navigator,
    localStorage: sandbox.localStorage,
    console: createNativeConsole(console),
    JSON,
    Math,
    Date,
    RegExp,
    Map,
    Set,
    WeakMap,
    WeakSet,
    Array,
    Object,
    Number,
    String,
    Boolean,
    Symbol,
    Function,
    screen: sandbox.screen,
    Error,
    TypeError,
    RangeError,
    SyntaxError,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    encodeURIComponent,
    decodeURIComponent,
    NaN,
    Infinity,
    undefined,
    Promise,
    Proxy,
    Reflect,
    Uint8Array,
    Int8Array,
    Uint16Array,
    Int16Array,
    Uint32Array,
    Int32Array,
    Float32Array,
    Float64Array,
    BigInt,
    fetch: sandbox.fetch,
    TextEncoder,
    TextDecoder,
    URL,
    URLSearchParams,
    AbortSignal,
    AbortController,
    Buffer: playerBuffer,
    atob: sandbox.atob,
    btoa: sandbox.btoa,
    Worker: sandbox.Worker,
    MessageChannel: sandbox.MessageChannel,
    ...ctx.props,
    id: ctx.id,
    host,
  }
}

export async function resolveServers(sessionToken, ctx = {}) {
  ensurePlayerReady()
  const apiPrefix = requirePlayerRoute('__playerApiPrefix')
  const servers = []
  let probeBody = null
  const playerContext = buildPlayerContext(sessionToken, ctx, {
    setServers: (list) => {
      const previous = servers.at(-1)
      const rows = typeof list === 'function' ? list(previous ?? []) : list
      if (!Array.isArray(rows)) throw new Error('server list callback returned invalid')
      servers.push(structuredClone(rows))
    },
    setState: () => {},
    setFavServer: () => {},
  })

  const upstreamFetch = ctx.fetch
  if (typeof upstreamFetch !== 'function') throw new Error('fetch missing')
  playerContext.fetch = async (input, init = {}) => {
    const url = String(input)
    const response = await upstreamFetch(input, init)
    if (init.method === 'POST' && url.includes(apiPrefix) && !probeBody && response.ok) {
      probeBody =
        typeof response.clone === 'function' ? await response.clone().text() : await response.text()
    }
    return response
  }
  sandbox.fetch = playerContext.fetch

  for (const key of ['crypto', 'encode', 'en', 'server', 'setServers', 'setState', 'setFavServer', 'fetch']) {
    sandbox[key] = playerContext[key]
  }

  await requirePlayerExport('__playerInit')(playerContext)

  const deadline = Date.now() + (ctx.timeoutMs || RESOLVE_TIMEOUT_MS)
  while (servers.length === 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  if (servers.length === 0) throw new Error('server list empty')

  let activeServers = servers.at(-1)
  if (!Array.isArray(activeServers)) throw new Error('server list invalid')
  if (probeBody) {
    const decrypted = []
    await requirePlayerExport('__playerDecrypt')({ ...playerContext, dr: decrypted, rs: probeBody })
    if (decrypted[0] == null) throw new Error('decrypt failed')
    if (!Array.isArray(decrypted[0]) || !decrypted[0].length) throw new Error('probe decrypt invalid')
    activeServers = decrypted[0]
  }

  return { servers: [activeServers], playerContext }
}
