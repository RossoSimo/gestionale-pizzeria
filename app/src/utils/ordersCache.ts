type Order = { items?: unknown[]; createdAt?: string }

let _cache: { ts: number; data: Order[] } | null = null

/**
 * Return orders parsed from localStorage with a simple in-memory TTL cache.
 * TTL default 1 minute for responsiveness in dev; you can pass a custom ttlMs.
 */
export function getOrdersCached(ttlMs?: number): Order[] {
  // default TTL: 5 minutes in production, 1 minute in dev
  const proc = typeof process !== 'undefined' ? (process as unknown as { env?: { NODE_ENV?: string } }) : undefined
  const env = proc && proc.env && proc.env.NODE_ENV ? proc.env.NODE_ENV : 'development'
  const defaultTtl = env === 'production' ? 15 * 60 * 1000 : 60 * 1000
  const ttl = typeof ttlMs === 'number' ? ttlMs : defaultTtl
  const now = Date.now()
  if (_cache && now - _cache.ts < ttl) return _cache.data
  try {
    const raw = localStorage.getItem('orders')
    const arr = raw ? (JSON.parse(raw) as Order[]) : []
    _cache = { ts: now, data: Array.isArray(arr) ? arr : [] }
    return _cache.data
  } catch (e) {
    _cache = { ts: now, data: [] }
    return []
  }
}

export function clearOrdersCache() {
  _cache = null
}

// Small helper for manual testing in the renderer console
declare global {
  interface Window { __ordersCacheDebug?: { clear: () => void; get: () => Order[] } }
}
if (typeof window !== 'undefined') {
  window.__ordersCacheDebug = {
    clear: clearOrdersCache,
    get: () => getOrdersCached()
  }
}
