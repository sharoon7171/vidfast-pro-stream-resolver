export const port = Number(process.env.PORT) || 3000

export const vidfastOrigin = process.env.VIDFAST_ORIGIN || 'https://vidfast.pro'

export const userAgent =
  process.env.USER_AGENT ||
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

export const playerCsrfToken =
  process.env.VIDFAST_CSRF || '0qv1jDQw6mHsiQm7fDjrWm1VNq9sqm2a'
