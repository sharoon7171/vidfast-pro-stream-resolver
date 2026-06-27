export function playUrl(siteOrigin, upstreamUrl) {
  return `${siteOrigin}/api/hls?url=${encodeURIComponent(upstreamUrl)}`
}
