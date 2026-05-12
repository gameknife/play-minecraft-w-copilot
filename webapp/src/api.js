export async function fetchJson(path, options = {}) {
  const response = await fetch(path, { cache: 'no-store', ...options })
  let payload = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }
  if (!response.ok) {
    throw new Error(payload?.error || payload?.detail || `请求失败：${response.status}`)
  }
  return payload
}

export const api = {
  status: () => fetchJson('/api/status'),
  mapData: (refresh = false) => fetchJson(`/api/map-data${refresh ? '?refresh=1' : ''}`),
  livePlayers: () => fetchJson('/api/live-players'),
  teleportPreview: (x, z) => fetchJson(`/api/teleport-preview?x=${encodeURIComponent(x)}&z=${encodeURIComponent(z)}`),
  teleportPlayer: (payload) =>
    fetchJson('/api/teleport-player', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
}
