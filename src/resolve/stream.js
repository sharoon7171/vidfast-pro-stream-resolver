import { fetchPlayerPage } from '../vidfast/page.js'
import { createPlayerFetch } from '../vidfast/session.js'
import { playUrl } from '../relay/link.js'
import { openServerStream, resolveServers } from '../player/runtime.js'
import { runParallel } from './parallel-pool.js'

function serversWithData(servers) {
  const list = servers.at(-1)
  if (!list) throw new Error('server list empty')
  return list.filter((entry) => entry?.data)
}

async function prepareResolveSession(input) {
  const page = await fetchPlayerPage(input.kind, input.id, {
    season: input.season,
    episode: input.episode,
  })
  const playerFetch = createPlayerFetch(page.referer, page.cookies)
  const resolved = await resolveServers(page.sessionToken, {
    props: page.props,
    type: page.type,
    id: page.id,
    season: input.season,
    episode: input.episode,
    referer: page.referer,
    fetch: playerFetch,
  })
  const servers = serversWithData(resolved.servers)
  if (!servers.length) throw Object.assign(new Error('server list empty'), { stage: 'resolve' })
  return { page, playerFetch, playerContext: resolved.playerContext, servers }
}

async function testServerStream(server, playerFetch, playerContext, siteOrigin) {
  const started = Date.now()
  const { url } = await openServerStream(server, playerFetch, playerContext)
  return {
    name: server.name,
    ms: Date.now() - started,
    url,
    play: playUrl(siteOrigin, url),
  }
}

export async function* stream(input, siteOrigin) {
  let session
  try {
    session = await prepareResolveSession(input)
  } catch (err) {
    yield { event: 'error', stage: err.stage || 'resolve', error: err.message }
    return
  }

  const { page, playerFetch, playerContext, servers } = session
  yield { event: 'meta', title: page.meta.title, year: page.meta.year }

  let found = false
  for await (const hit of runParallel(
    servers,
    (server) => testServerStream(server, playerFetch, playerContext, siteOrigin),
    servers.length,
  )) {
    if (hit.error) continue
    found = true
    yield { event: 'server', server: hit.value }
  }

  if (!found) yield { event: 'error', stage: 'resolve', error: 'no working server' }
}
