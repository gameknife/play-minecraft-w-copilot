export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function uptimeText(seconds) {
  if (seconds === null || seconds === undefined) return '等待服务器启动'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  if (hours) return `${hours}h ${minutes}m`
  if (minutes) return `${minutes}m ${secs}s`
  return `${secs}s`
}

export function playerColor(name) {
  let hash = 0
  for (const char of String(name)) {
    hash = (hash * 33 + char.charCodeAt(0)) % 360
  }
  return `hsl(${hash}, 78%, 64%)`
}
