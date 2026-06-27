import Hls from '/vendor/hls.mjs'
import { MediaPlayer } from '/vendor/dash.mjs'

const REF = 'https://vidfast.pro/'
const MOVIE_ID = '550'
const TV_ID = '44217'
const TV_SEASON = '1'
const TV_EPISODE = '1'

const $ = (id) => document.getElementById(id)

const form = $('form')
const typeIn = $('type')
const idIn = $('id')
const idLabel = $('id-label')
const tvFields = $('tv-fields')
const hintMovie = $('hint-movie')
const hintTv = $('hint-tv')
const seasonIn = $('season')
const episodeIn = $('episode')
const panel = $('out')
const heading = $('title')
const video = $('video')
const err = $('err')
const btn = form.querySelector('button')
const rawOut = $('direct')
const browserOut = $('browser')
const vlcOut = $('vlc')
const mpvOut = $('mpv')
const timing = $('timing')
const tResolve = $('t-resolve')
const tPlay = $('t-play')
const serversEl = $('servers')

let hls = null
let dashPlayer = null
let gen = 0
let timerRaf = null
let lastLabel = ''
let lastServers = []
let lastActive = ''
let playing = false

function fmtMs(ms) {
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(2)}s`
}

function mediaLabel(title, year) {
  return year ? `${title} (${year})` : title
}

function showErr(message) {
  err.textContent = message
  err.hidden = false
}

function stopTimer() {
  if (!timerRaf) return
  cancelAnimationFrame(timerRaf)
  timerRaf = null
}

function beginResolve() {
  stopTimer()
  timing.hidden = false
  tResolve.textContent = '0ms'
  tResolve.className = 'timing__val is-live'
  tPlay.textContent = '—'
  tPlay.className = 'timing__val'

  const t0 = performance.now()
  const tick = () => {
    tResolve.textContent = fmtMs(performance.now() - t0)
    timerRaf = requestAnimationFrame(tick)
  }
  timerRaf = requestAnimationFrame(tick)

  return () => {
    stopTimer()
    tResolve.textContent = fmtMs(performance.now() - t0)
    tResolve.className = 'timing__val is-done'
    return beginPlayback()
  }
}

function beginPlayback() {
  stopTimer()
  tPlay.textContent = '0ms'
  tPlay.className = 'timing__val is-live'

  const t0 = performance.now()
  const tick = () => {
    tPlay.textContent = fmtMs(performance.now() - t0)
    timerRaf = requestAnimationFrame(tick)
  }
  timerRaf = requestAnimationFrame(tick)

  return () => {
    stopTimer()
    tPlay.textContent = fmtMs(performance.now() - t0)
    tPlay.className = 'timing__val is-done'
  }
}

function vlcCmd(url) {
  return `vlc --http-referrer='${REF}' "${url}"`
}

function mpvCmd(url, name) {
  return `mpv --referrer='${REF}' --force-media-title="${name.replace(/"/g, '\\"')}" "${url}"`
}

function stop() {
  gen += 1
  if (hls) {
    hls.destroy()
    hls = null
  }
  if (dashPlayer) {
    dashPlayer.reset()
    dashPlayer.destroy()
    dashPlayer = null
  }
  video.pause()
  video.removeAttribute('src')
  video.load()
}

function guessFormat(url) {
  const lower = url.toLowerCase()
  if (lower.includes('.m3u8') || lower.includes('type=hls')) return 'hls'
  return null
}

function relayUrl(url) {
  if (url.includes('/api/hls?')) return url
  return `/api/hls?url=${encodeURIComponent(url)}`
}

async function loadFormat(entry) {
  if (entry.format) return entry.format
  const guessed = guessFormat(entry.url)
  if (guessed) {
    entry.format = guessed
    return guessed
  }
  const res = await fetch(`/api/sniff?url=${encodeURIComponent(entry.url)}`)
  if (!res.ok) throw new Error('format sniff failed')
  const { format } = await res.json()
  if (!format) throw new Error('unknown stream format')
  entry.format = format
  return format
}

function prefetchFormat(entry) {
  if (entry.format || guessFormat(entry.url)) return
  void loadFormat(entry).catch(() => {})
}

function whenFirstFrame(video, dashPlayer, live, onDone) {
  let done = false
  const finish = () => {
    if (done || !live()) return
    done = true
    video.removeEventListener('timeupdate', onTime)
    onDone()
  }
  const onTime = () => {
    if (video.currentTime > 0) finish()
  }
  video.addEventListener('playing', finish, { once: true })
  video.addEventListener('timeupdate', onTime, { passive: true })
  dashPlayer.on(MediaPlayer.events.PLAYBACK_STARTED, finish)
  dashPlayer.on(MediaPlayer.events.PLAYBACK_PLAYING, finish)
}

function playDash(entry, markPlaybackDone) {
  const id = gen
  const live = () => id === gen

  return new Promise((resolve, reject) => {
    const fail = (message) => {
      if (!live()) return
      reject(new Error(message))
    }

    const finish = () => {
      err.hidden = true
      markPlaybackDone?.()
      resolve()
    }

    dashPlayer = MediaPlayer().create()
    dashPlayer.updateSettings({
      streaming: {
        buffer: {
          bufferTimeAtTopQuality: 4,
          bufferTimeAtTopQualityLongForm: 4,
          bufferTimeDefault: 4,
        },
        scheduling: { scheduleWhilePaused: false },
      },
    })
    dashPlayer.addRequestInterceptor(async (request) => {
      request.url = relayUrl(request.url)
      return request
    })
    whenFirstFrame(video, dashPlayer, live, finish)
    dashPlayer.on(MediaPlayer.events.ERROR, (_, data) => {
      if (data?.error) fail(String(data.error.message || data.error.code || 'playback failed'))
    })
    dashPlayer.initialize(video, entry.play, false)
    video.play().catch((error) => fail(error.message))
  })
}

async function play(entry, markPlaybackDone) {
  stop()
  if (entry.format === 'dash') return playDash(entry, markPlaybackDone)
  if (entry.format === 'hls' || guessFormat(entry.url) === 'hls') {
    entry.format = 'hls'
    return playHls(entry, markPlaybackDone)
  }
  const format = await loadFormat(entry)
  if (format === 'dash') return playDash(entry, markPlaybackDone)
  return playHls(entry, markPlaybackDone)
}

function playHls(entry, markPlaybackDone) {
  const id = gen
  const source = entry.play

  if (!Hls.isSupported()) {
    throw new Error('HLS not supported')
  }

  const live = () => id === gen

  return new Promise((resolve, reject) => {
    const fail = (message) => {
      if (!live()) return
      reject(new Error(message))
    }

    const onPlaying = () => {
      if (!live()) return
      err.hidden = true
      markPlaybackDone?.()
      resolve()
    }

    video.addEventListener('playing', onPlaying, { once: true })
    video.addEventListener('error', () => fail('playback failed'), { once: true })

    hls = new Hls({ enableWorker: true, maxBufferLength: 8, maxMaxBufferLength: 16 })
    hls.on(Hls.Events.ERROR, (_, data) => {
      if (data.fatal) fail(data.details ?? 'playback failed')
    })
    hls.attachMedia(video)
    hls.loadSource(source)
    video.play().catch((error) => fail(error.message))
  })
}

function serverByName(name) {
  return lastServers.find((entry) => entry.name === name)
}

function bindExports(entry) {
  rawOut.value = entry.url
  browserOut.value = entry.play
  vlcOut.value = vlcCmd(entry.url)
  mpvOut.value = mpvCmd(entry.url, lastLabel)
}

function renderServers(servers, active) {
  serversEl.innerHTML = servers
    .map((entry) => {
      const picked = entry.name === active ? ' badge--active' : ''
      return `<button type="button" class="badge${picked}" data-name="${entry.name}"><span class="badge__name">${entry.name}</span><span class="badge__ms">${fmtMs(entry.ms)}</span></button>`
    })
    .join('')
  serversEl.closest('.card').hidden = servers.length === 0
}

function selectServer(name) {
  const entry = serverByName(name)
  if (!entry) return null
  lastActive = name
  heading.textContent = `${lastLabel} · ${name}`
  renderServers(lastServers, lastActive)
  bindExports(entry)
  return entry
}

function syncType() {
  const tv = typeIn.value === 'tv'
  tvFields.hidden = !tv
  hintMovie.hidden = tv
  hintTv.hidden = !tv
  idLabel.textContent = tv ? 'TV ID' : 'Movie ID'
  idIn.placeholder = tv ? TV_ID : MOVIE_ID
  seasonIn.required = tv
  episodeIn.required = tv
  const current = idIn.value.trim()
  if (tv && (!current || current === MOVIE_ID)) idIn.value = TV_ID
  if (!tv && (!current || current === TV_ID)) idIn.value = MOVIE_ID
  if (tv) {
    if (!seasonIn.value.trim()) seasonIn.value = TV_SEASON
    if (!episodeIn.value.trim()) episodeIn.value = TV_EPISODE
  } else {
    seasonIn.value = ''
    episodeIn.value = ''
  }
}

function queryParams() {
  const params = new URLSearchParams({ type: typeIn.value, id: idIn.value.trim() })
  if (typeIn.value === 'tv') {
    params.set('season', seasonIn.value.trim())
    params.set('episode', episodeIn.value.trim())
  }
  return params
}

async function handleResolveEvent(evt, finishResolve) {
  if (evt.event === 'error') throw new Error(`${evt.stage || 'error'}: ${evt.error || 'resolve failed'}`)
  if (evt.event === 'meta') {
    lastLabel = mediaLabel(evt.title, evt.year)
    panel.hidden = false
    return
  }
  if (evt.event !== 'server') return
  lastServers.push(evt.server)
  prefetchFormat(evt.server)
  renderServers(lastServers, lastActive)
  if (!playing) {
    playing = true
    const markPlaybackDone = finishResolve()
    selectServer(evt.server.name)
    play(evt.server, markPlaybackDone).catch((e) => showErr(e.message))
  }
  await new Promise((r) => requestAnimationFrame(r))
}

async function consumeResolve(url, finishResolve) {
  let chain = Promise.resolve()
  const enqueue = (evt) => {
    chain = chain.then(() => handleResolveEvent(evt, finishResolve))
  }

  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('GET', url)
    let offset = 0
    let buf = ''
    let failed = false

    const fail = (error) => {
      if (failed) return
      failed = true
      reject(error)
    }

    const flush = () => {
      const chunk = xhr.responseText.slice(offset)
      if (!chunk) return
      offset = xhr.responseText.length
      buf += chunk
      const lines = buf.split('\n')
      buf = lines.pop() || ''
      for (const line of lines) {
        if (!line.trim()) continue
        enqueue(JSON.parse(line))
      }
    }

    const finish = () => {
      if (failed) return
      if (xhr.status >= 400) {
        fail(new Error(`resolve failed: ${xhr.status}`))
        return
      }
      flush()
      if (buf.trim()) enqueue(JSON.parse(buf))
      chain.then(resolve).catch(reject)
    }

    xhr.onprogress = flush
    xhr.onload = finish
    xhr.onerror = () => fail(new Error('resolve failed'))
    xhr.send()
  })

  await chain
  if (!lastServers.length) throw new Error('no servers returned')
}

document.querySelectorAll('[data-copy]').forEach((node) => {
  node.addEventListener('click', async () => {
    const field = $(node.dataset.copy)
    await navigator.clipboard.writeText(field.value)
    const label = node.textContent
    node.textContent = 'Copied'
    node.classList.add('ok')
    setTimeout(() => {
      node.textContent = label
      node.classList.remove('ok')
    }, 1200)
  })
})

serversEl.addEventListener('click', async (event) => {
  const btnNode = event.target.closest('[data-name]')
  if (!btnNode || btnNode.dataset.name === lastActive) return
  const entry = selectServer(btnNode.dataset.name)
  if (!entry) return
  err.hidden = true
  try {
    await play(entry, beginPlayback())
  } catch (e) {
    showErr(e.message)
  }
})

typeIn.addEventListener('change', syncType)
syncType()

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  btn.disabled = true
  err.hidden = true
  panel.hidden = true
  stop()
  lastServers = []
  lastActive = ''
  playing = false
  const finishResolve = beginResolve()
  try {
    await consumeResolve(`/api/resolve?${queryParams()}`, finishResolve)
  } catch (e) {
    stopTimer()
    timing.hidden = true
    showErr(e.message)
  } finally {
    btn.disabled = false
  }
})
