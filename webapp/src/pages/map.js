import { api } from '../api'
import { escapeHtml, playerColor } from '../shared'

const structureStyles = {
  village: { fill: '#86efac', stroke: 'rgba(20, 83, 45, .95)' },
  desert_temple: { fill: '#f59e0b', stroke: 'rgba(120, 53, 15, .95)' },
  jungle_temple: { fill: '#22c55e', stroke: 'rgba(20, 83, 45, .95)' },
  woodland_mansion: { fill: '#a78bfa', stroke: 'rgba(76, 29, 149, .95)' },
  pillager_outpost: { fill: '#ef4444', stroke: 'rgba(127, 29, 29, .95)' },
  witch_hut: { fill: '#64748b', stroke: 'rgba(30, 41, 59, .95)' },
  igloo: { fill: '#bae6fd', stroke: 'rgba(12, 74, 110, .95)' },
  ocean_monument: { fill: '#0ea5a4', stroke: 'rgba(17, 94, 89, .95)' },
}

const initialLayerVisibility = {
  terrain: true,
  rails: true,
  'predicted-village': true,
  'predicted-desert_temple': true,
  'predicted-jungle_temple': true,
  'predicted-woodland_mansion': true,
  'predicted-pillager_outpost': true,
  'predicted-witch_hut': true,
  'predicted-igloo': true,
  'predicted-ocean_monument': true,
  villages: true,
  savedPlayers: true,
  onlinePlayers: true,
  spawn: true,
}

function mapPageMarkup() {
  return `
    <main class="wrap map-wrap">
      <header class="topbar">
        <div class="brand">Minecraft 服管</div>
        <nav class="nav">
          <a class="nav-link" href="/">状态</a>
          <a class="nav-link active" href="/map">地图</a>
        </nav>
      </header>
      <section class="layout">
        <article class="panel map-panel">
          <div class="viewport" id="viewport">
            <div class="top-controls">
              <div class="meta">
                <span id="coord-readout" class="metric">X -- · Z --</span>
              </div>
              <button class="button" id="fit-button" type="button">适配视图</button>
            </div>
            <div class="overlay-panel legend-overlay" id="legend-controls">
              <button class="legend-toggle" type="button" data-layer-toggle="terrain"><span class="swatch terrain" style="background:#7dbd4c"></span><span>地形</span></button>
              <button class="legend-toggle" type="button" data-layer-toggle="rails"><span class="swatch rail"></span><span>铁路</span></button>
              <button class="legend-toggle" type="button" data-layer-toggle="predicted-village"><span class="swatch diamond" style="--swatch-fill:#86efac;--swatch-stroke:rgba(20, 83, 45, .95)"></span><span>预测村庄</span></button>
              <button class="legend-toggle" type="button" data-layer-toggle="predicted-desert_temple"><span class="swatch diamond" style="--swatch-fill:#f59e0b;--swatch-stroke:rgba(120, 53, 15, .95)"></span><span>沙漠神殿</span></button>
              <button class="legend-toggle" type="button" data-layer-toggle="predicted-jungle_temple"><span class="swatch diamond" style="--swatch-fill:#22c55e;--swatch-stroke:rgba(20, 83, 45, .95)"></span><span>丛林神殿</span></button>
              <button class="legend-toggle" type="button" data-layer-toggle="predicted-woodland_mansion"><span class="swatch diamond" style="--swatch-fill:#a78bfa;--swatch-stroke:rgba(76, 29, 149, .95)"></span><span>林地府邸</span></button>
              <button class="legend-toggle" type="button" data-layer-toggle="predicted-pillager_outpost"><span class="swatch diamond" style="--swatch-fill:#ef4444;--swatch-stroke:rgba(127, 29, 29, .95)"></span><span>掠夺者前哨站</span></button>
              <button class="legend-toggle" type="button" data-layer-toggle="predicted-witch_hut"><span class="swatch diamond" style="--swatch-fill:#64748b;--swatch-stroke:rgba(30, 41, 59, .95)"></span><span>女巫小屋</span></button>
              <button class="legend-toggle" type="button" data-layer-toggle="predicted-igloo"><span class="swatch diamond" style="--swatch-fill:#bae6fd;--swatch-stroke:rgba(12, 74, 110, .95)"></span><span>雪屋</span></button>
              <button class="legend-toggle" type="button" data-layer-toggle="predicted-ocean_monument"><span class="swatch diamond" style="--swatch-fill:#0ea5a4;--swatch-stroke:rgba(17, 94, 89, .95)"></span><span>海底神殿</span></button>
              <button class="legend-toggle" type="button" data-layer-toggle="villages"><span class="swatch village"></span><span>已发现村庄</span></button>
              <button class="legend-toggle" type="button" data-layer-toggle="savedPlayers"><span class="swatch saved"></span><span>存储位置</span></button>
              <button class="legend-toggle" type="button" data-layer-toggle="onlinePlayers"><span class="swatch player"></span><span>在线玩家</span></button>
              <button class="legend-toggle" type="button" data-layer-toggle="spawn"><span class="swatch spawn"></span><span>出生点</span></button>
            </div>
            <section class="overlay-panel summary-overlay">
              <h2 class="overlay-title">世界摘要</h2>
              <div class="stats-grid">
                <article class="card"><span>种子</span><strong id="seed-value" class="mono">...</strong></article>
                <article class="card"><span>区块数</span><strong id="chunk-count">0</strong></article>
                <article class="card"><span>铁路点位</span><strong id="rail-count">0</strong></article>
                <article class="card"><span>预测结构</span><strong id="predicted-structure-count">0</strong></article>
                <article class="card"><span>村庄数</span><strong id="village-count">0</strong></article>
                <article class="card"><span>存储位置</span><strong id="saved-player-count">0</strong></article>
              </div>
              <p class="footer" id="updated-at">更新中...</p>
            </section>
            <section class="overlay-panel players-overlay">
              <h2 class="overlay-title">在线玩家</h2>
              <div class="player-pill-group" id="online-player-pills">
                <div class="status-note">正在检查在线玩家...</div>
              </div>
              <p class="footer" id="online-player-help">先选中一名在线玩家，再点击地图选择传送目标。</p>
            </section>
            <canvas id="map-canvas"></canvas>
            <div class="marker-tooltip" id="marker-tooltip"></div>
            <div class="hud metric" id="hud">等待地图数据</div>
          </div>
        </article>
      </section>
      <div class="modal-backdrop" id="teleport-modal-backdrop">
        <div class="modal">
          <h2>确认传送</h2>
          <p class="status-note" id="teleport-modal-copy">请先选择玩家和地图目标。</p>
          <div class="modal-actions">
            <button class="button secondary" id="teleport-cancel-button" type="button">取消</button>
            <button class="button confirm" id="teleport-confirm-button" type="button">确认传送</button>
          </div>
        </div>
      </div>
    </main>
  `
}

function biomeColor(biome, avgHeight) {
  const name = String(biome || '').toLowerCase()
  let base = [125, 189, 76]
  if (name.includes('ocean') || name.includes('river')) base = [60, 110, 216]
  else if (name.includes('desert') || name.includes('beach') || name.includes('mesa')) base = [216, 192, 124]
  else if (name.includes('forest') || name.includes('taiga') || name.includes('grove')) base = [77, 125, 82]
  else if (name.includes('snow') || name.includes('ice') || name.includes('frozen')) base = [202, 220, 233]
  else if (name.includes('mountain') || name.includes('peak') || name.includes('stony') || name.includes('extreme_hills')) base = [126, 122, 141]
  else if (name.includes('swamp') || name.includes('mangrove')) base = [74, 108, 74]
  else if (name.includes('jungle')) base = [67, 129, 60]
  else if (name.includes('savanna')) base = [179, 166, 87]
  else if (name.includes('cherry')) base = [204, 150, 172]
  const modifier = Math.max(-0.18, Math.min(0.18, ((avgHeight || 80) - 80) / 220))
  const shade = modifier >= 0 ? 255 * modifier : 0
  return `rgb(${Math.max(0, Math.min(255, base[0] + shade))}, ${Math.max(0, Math.min(255, base[1] + shade))}, ${Math.max(0, Math.min(255, base[2] + shade))})`
}

export async function renderMapPage(root) {
  document.body.className = 'page-map'
  document.title = 'Minecraft 世界地图'
  root.innerHTML = mapPageMarkup()

  const canvas = document.getElementById('map-canvas')
  const viewport = document.getElementById('viewport')
  const hud = document.getElementById('hud')
  const markerTooltip = document.getElementById('marker-tooltip')
  const context = canvas.getContext('2d')

  const state = { scale: 0.12, offsetX: 0, offsetY: 0, dragging: false, dragMoved: false, dragX: 0, dragY: 0, fitted: false }
  let mapData = null
  let livePlayers = []
  let selectedPlayerName = null
  let pendingTeleport = null
  let hoveredMarker = null
  const layerVisibility = { ...initialLayerVisibility }

  const isLayerVisible = (layer) => layerVisibility[layer] !== false
  const isStructureVisible = (type) => isLayerVisible(`predicted-${type}`)
  const selectedPlayer = () => livePlayers.find((player) => player.name === selectedPlayerName) ?? null

  const worldToScreen = (x, z) => [x * state.scale + state.offsetX, z * state.scale + state.offsetY]
  const screenToWorld = (x, y) => [(x - state.offsetX) / state.scale, (y - state.offsetY) / state.scale]
  const markerHit = (screenX, screenY, markerX, markerY, radius) => {
    const dx = screenX - markerX
    const dy = screenY - markerY
    return dx * dx + dy * dy <= radius * radius
  }

  function renderLayerControls() {
    for (const button of document.querySelectorAll('[data-layer-toggle]')) {
      const layer = button.getAttribute('data-layer-toggle')
      const active = isLayerVisible(layer)
      button.classList.toggle('off', !active)
      button.setAttribute('aria-pressed', active ? 'true' : 'false')
    }
  }

  function hideMarkerTooltip() {
    markerTooltip.textContent = ''
    markerTooltip.classList.remove('open')
  }

  function showMarkerTooltip(text, mouseX, mouseY) {
    markerTooltip.textContent = text
    markerTooltip.classList.add('open')
    const width = markerTooltip.offsetWidth || 180
    const height = markerTooltip.offsetHeight || 36
    const left = Math.min(Math.max(12, mouseX + 14), Math.max(12, viewport.clientWidth - width - 12))
    const top = Math.min(Math.max(12, mouseY + 14), Math.max(12, viewport.clientHeight - height - 12))
    markerTooltip.style.left = `${left}px`
    markerTooltip.style.top = `${top}px`
  }

  function markerHoverText(marker) {
    if (!marker) return null
    if (marker.kind === 'predicted-structure') return `${marker.label} · X ${marker.x} · Z ${marker.z}`
    if (marker.kind === 'village') return `已发现村庄 · X ${marker.x} · Z ${marker.z}`
    if (marker.kind === 'saved-player') return `存储位置 · ${marker.label} · X ${marker.x} · Y ${marker.y} · Z ${marker.z}`
    if (marker.kind === 'online-player') return `在线玩家 · ${marker.name} · X ${marker.x.toFixed(1)} · Y ${marker.y.toFixed(1)} · Z ${marker.z.toFixed(1)}`
    if (marker.kind === 'spawn') return `世界出生点 · X ${marker.x} · Z ${marker.z}`
    return null
  }

  function drawVillageMarker(x, z) {
    context.save()
    context.translate(x, z)
    context.fillStyle = '#ffcf62'
    context.strokeStyle = 'rgba(34, 24, 12, .85)'
    context.lineWidth = 1.4
    context.beginPath()
    context.moveTo(0, -9)
    context.lineTo(9, -1)
    context.lineTo(9, 9)
    context.lineTo(-9, 9)
    context.lineTo(-9, -1)
    context.closePath()
    context.fill()
    context.stroke()
    context.beginPath()
    context.moveTo(-11, -1)
    context.lineTo(0, -11)
    context.lineTo(11, -1)
    context.closePath()
    context.fillStyle = '#ff9f43'
    context.fill()
    context.stroke()
    context.restore()
  }

  function drawSavedPositionMarker(x, z) {
    context.save()
    context.translate(x, z)
    context.fillStyle = '#74d9ff'
    context.strokeStyle = 'rgba(5, 19, 31, .9)'
    context.lineWidth = 1.4
    context.beginPath()
    context.moveTo(0, -10)
    context.lineTo(8, 0)
    context.lineTo(0, 10)
    context.lineTo(-8, 0)
    context.closePath()
    context.fill()
    context.stroke()
    context.fillStyle = 'rgba(255,255,255,.85)'
    context.beginPath()
    context.arc(0, 0, 2.3, 0, Math.PI * 2)
    context.fill()
    context.restore()
  }

  function drawPredictedStructureMarker(structure) {
    const style = structureStyles[structure.type] ?? { fill: '#f8fafc', stroke: 'rgba(15, 23, 42, .95)' }
    const [x, z] = worldToScreen(structure.x, structure.z)
    const size = Math.max(5.5, Math.min(11.5, state.scale * 6.2))
    context.save()
    context.translate(x, z)
    context.rotate(Math.PI / 4)
    context.fillStyle = style.fill
    context.strokeStyle = style.stroke
    context.lineWidth = Math.max(1.1, size * 0.14)
    context.fillRect(-size / 2, -size / 2, size, size)
    context.strokeRect(-size / 2, -size / 2, size, size)
    context.restore()
  }

  function drawSpawnMarker(x, z) {
    context.save()
    context.translate(x, z)
    context.fillStyle = '#7cf08a'
    context.strokeStyle = 'rgba(9, 30, 14, .95)'
    context.lineWidth = 1.6
    context.beginPath()
    context.moveTo(0, -11)
    context.lineTo(4, -4)
    context.lineTo(11, 0)
    context.lineTo(4, 4)
    context.lineTo(0, 11)
    context.lineTo(-4, 4)
    context.lineTo(-11, 0)
    context.lineTo(-4, -4)
    context.closePath()
    context.fill()
    context.stroke()
    context.restore()
  }

  function findHoveredMarker(screenX, screenY) {
    if (!mapData) return null

    if (isLayerVisible('onlinePlayers')) {
      for (const player of livePlayers) {
        const [x, z] = worldToScreen(player.x, player.z)
        const radius = selectedPlayerName === player.name ? 10 : 8
        if (markerHit(screenX, screenY, x, z, radius)) return { kind: 'online-player', ...player }
      }
    }

    if (isLayerVisible('savedPlayers')) {
      for (const player of mapData.savedPlayers ?? []) {
        const [x, z] = worldToScreen(player.x, player.z)
        if (markerHit(screenX, screenY, x, z, 10)) return { kind: 'saved-player', ...player }
      }
    }

    if (isLayerVisible('villages')) {
      for (const village of mapData.villages ?? []) {
        const [x, z] = worldToScreen(village.x, village.z)
        if (markerHit(screenX, screenY, x, z, 12)) return { kind: 'village', ...village }
      }
    }

    for (const structure of mapData.predictedStructures ?? []) {
      if (!isStructureVisible(structure.type)) continue
      const [x, z] = worldToScreen(structure.x, structure.z)
      const radius = Math.max(7, Math.min(13, state.scale * 7))
      if (markerHit(screenX, screenY, x, z, radius)) return { kind: 'predicted-structure', ...structure }
    }

    if (isLayerVisible('spawn') && mapData.spawn) {
      const [x, z] = worldToScreen(mapData.spawn.x, mapData.spawn.z)
      if (markerHit(screenX, screenY, x, z, 12)) return { kind: 'spawn', ...mapData.spawn }
    }

    return null
  }

  function drawRailOverlay() {
    if (!isLayerVisible('rails') || !Array.isArray(mapData?.rails) || !mapData.rails.length) return
    const [worldX0, worldZ0] = screenToWorld(0, 0)
    const [worldX1, worldZ1] = screenToWorld(viewport.clientWidth, viewport.clientHeight)
    const minX = Math.min(worldX0, worldX1) - 8
    const maxX = Math.max(worldX0, worldX1) + 8
    const minZ = Math.min(worldZ0, worldZ1) - 8
    const maxZ = Math.max(worldZ0, worldZ1) + 8
    const size = Math.max(1.2, Math.min(4.6, state.scale * 1.9))
    context.save()
    context.fillStyle = 'rgba(255, 198, 84, .92)'
    context.strokeStyle = 'rgba(76, 48, 18, .95)'
    context.lineWidth = Math.max(0.35, size * 0.18)
    for (const rail of mapData.rails) {
      if (rail.x < minX || rail.x > maxX || rail.z < minZ || rail.z > maxZ) continue
      const [x, z] = worldToScreen(rail.x, rail.z)
      context.fillRect(x - size / 2, z - size / 2, size, size)
      if (size >= 2.2) context.strokeRect(x - size / 2, z - size / 2, size, size)
    }
    context.restore()
  }

  function draw() {
    const width = viewport.clientWidth
    const height = viewport.clientHeight
    context.clearRect(0, 0, width, height)

    if (!mapData) {
      context.fillStyle = 'rgba(255,255,255,.75)'
      context.font = '16px Inter, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Noto Sans SC", "WenQuanYi Micro Hei", system-ui, sans-serif'
      context.fillText('正在加载世界数据...', 20, 28)
      return
    }

    context.save()
    if (isLayerVisible('terrain')) {
      for (const chunk of mapData.chunks) {
        const worldX = chunk.x * 16
        const worldZ = chunk.z * 16
        const biomeCells = Array.isArray(chunk.biomeCells) && chunk.biomeCells.length === 4 ? chunk.biomeCells : null
        if (biomeCells) {
          const cellSize = Math.max(1, 8 * state.scale)
          for (const cell of biomeCells) {
            const [x, z] = worldToScreen(worldX + (cell.offsetX ?? 0), worldZ + (cell.offsetZ ?? 0))
            context.fillStyle = biomeColor(cell.biome ?? chunk.biome, chunk.avgHeight)
            context.fillRect(x, z, cellSize, cellSize)
          }
        } else {
          const [x, z] = worldToScreen(worldX, worldZ)
          const size = Math.max(1, 16 * state.scale)
          context.fillStyle = biomeColor(chunk.biome, chunk.avgHeight)
          context.fillRect(x, z, size, size)
        }
      }
    }

    drawRailOverlay()

    for (const structure of mapData.predictedStructures ?? []) {
      if (!isStructureVisible(structure.type)) continue
      drawPredictedStructureMarker(structure)
    }

    if (isLayerVisible('spawn') && mapData.spawn) {
      const [x, z] = worldToScreen(mapData.spawn.x, mapData.spawn.z)
      drawSpawnMarker(x, z)
    }

    if (isLayerVisible('villages')) {
      for (const village of mapData.villages ?? []) {
        const [x, z] = worldToScreen(village.x, village.z)
        drawVillageMarker(x, z)
      }
    }

    if (isLayerVisible('savedPlayers')) {
      for (const player of mapData.savedPlayers ?? []) {
        const [x, z] = worldToScreen(player.x, player.z)
        drawSavedPositionMarker(x, z)
      }
    }

    if (isLayerVisible('onlinePlayers')) {
      for (const player of livePlayers) {
        const [x, z] = worldToScreen(player.x, player.z)
        const radius = selectedPlayerName === player.name ? 8 : 6
        context.fillStyle = playerColor(player.name)
        context.beginPath()
        context.arc(x, z, radius, 0, Math.PI * 2)
        context.fill()
        context.lineWidth = selectedPlayerName === player.name ? 3 : 1.5
        context.strokeStyle = selectedPlayerName === player.name ? 'rgba(255,255,255,.95)' : 'rgba(0,0,0,.65)'
        context.stroke()
      }
    }

    context.restore()
    const selectedLabel = selectedPlayerName ? ` · 已选中 ${selectedPlayerName}` : ''
    hud.textContent = `区块 ${mapData.chunkCount} · 铁轨 ${mapData.railCount ?? 0} · 预测结构 ${mapData.predictedStructureCount ?? 0} · 村庄 ${mapData.villageCount} · 在线 ${livePlayers.length}${selectedLabel} · 缩放 ${state.scale.toFixed(3)}x`
  }

  function fitWorld() {
    if (!mapData?.bounds) return
    const width = viewport.clientWidth
    const height = viewport.clientHeight
    const spanX = Math.max(256, mapData.bounds.maxX - mapData.bounds.minX + 64)
    const spanZ = Math.max(256, mapData.bounds.maxZ - mapData.bounds.minZ + 64)
    state.scale = Math.min(width / spanX, height / spanZ) * 0.92
    state.offsetX = width / 2 - ((mapData.bounds.minX + mapData.bounds.maxX) / 2) * state.scale
    state.offsetY = height / 2 - ((mapData.bounds.minZ + mapData.bounds.maxZ) / 2) * state.scale
    state.fitted = true
    draw()
  }

  function resizeCanvas() {
    const rect = viewport.getBoundingClientRect()
    canvas.width = Math.max(480, Math.floor(rect.width * devicePixelRatio))
    canvas.height = Math.max(480, Math.floor(rect.height * devicePixelRatio))
    context.setTransform(1, 0, 0, 1, 0, 0)
    context.scale(devicePixelRatio, devicePixelRatio)
    draw()
  }

  function updateLists() {
    document.getElementById('seed-value').textContent = mapData.seed ?? '未知'
    document.getElementById('chunk-count').textContent = mapData.chunkCount
    document.getElementById('rail-count').textContent = mapData.railCount ?? 0
    document.getElementById('predicted-structure-count').textContent = mapData.predictedStructureCount ?? 0
    document.getElementById('village-count').textContent = mapData.villageCount
    document.getElementById('saved-player-count').textContent = mapData.savedPlayerCount
    document.getElementById('updated-at').textContent = `最近扫描：${new Date(mapData.generatedAt).toLocaleString()}`
  }

  function updateOnlinePlayers() {
    if (selectedPlayerName && !livePlayers.some((player) => player.name === selectedPlayerName)) selectedPlayerName = null
    const container = document.getElementById('online-player-pills')
    if (!livePlayers.length) {
      container.innerHTML = '<div class="status-note">当前没有在线玩家。</div>'
      document.getElementById('online-player-help').textContent = '有人上线后，这里会显示实时位置和地图传送入口。'
      draw()
      return
    }

    container.innerHTML = livePlayers
      .map((player) => {
        const active = selectedPlayerName === player.name ? ' active' : ''
        const color = playerColor(player.name)
        return `<button class="player-pill${active}" type="button" data-player-name="${escapeHtml(player.name)}" style="--player-color:${color}"><span class="player-swatch"></span><span>${escapeHtml(player.name)}</span></button>`
      })
      .join('')

    for (const button of container.querySelectorAll('[data-player-name]')) {
      button.addEventListener('click', () => {
        const name = button.getAttribute('data-player-name')
        selectedPlayerName = selectedPlayerName === name ? null : name
        updateOnlinePlayers()
        draw()
      })
    }

    const selected = selectedPlayer()
    document.getElementById('online-player-help').textContent = selected
      ? `已选中 ${selected.name}。点击地图可预览一次安全的主世界传送。`
      : '请选择一名在线玩家，然后点击地图上的安全陆地区域。'
    draw()
  }

  function openTeleportModal(preview) {
    pendingTeleport = preview
    document.getElementById('teleport-modal-copy').innerHTML =
      `确认将 <strong>${escapeHtml(preview.playerName)}</strong> 传送到 <span class="mono">X ${preview.target.x} · Y ${preview.target.y} · Z ${preview.target.z}</span> 吗？` +
      `<br><span class="status-note">目标地面高度为 ${preview.target.groundY}，生物群系为 <span class="mono">${escapeHtml(preview.target.biome)}</span>。传送前会先施加缓降和抗性效果。</span>`
    document.getElementById('teleport-modal-backdrop').classList.add('open')
  }

  function closeTeleportModal() {
    pendingTeleport = null
    document.getElementById('teleport-modal-backdrop').classList.remove('open')
  }

  async function loadMapData(refresh = false) {
    mapData = await api.mapData(refresh)
    updateLists()
    const warnings = Array.isArray(mapData.warnings) ? mapData.warnings.filter(Boolean) : []
    hud.textContent = warnings[0] || `地图已刷新 · ${mapData.chunkCount ?? 0} 个区块`
    if (!state.fitted) fitWorld()
    draw()
  }

  async function loadLivePlayers() {
    const payload = await api.livePlayers()
    livePlayers = Array.isArray(payload.players) ? payload.players : []
    updateOnlinePlayers()
  }

  document.getElementById('fit-button').addEventListener('click', fitWorld)
  document.getElementById('teleport-cancel-button').addEventListener('click', closeTeleportModal)
  document.getElementById('teleport-modal-backdrop').addEventListener('click', (event) => {
    if (event.target.id === 'teleport-modal-backdrop') closeTeleportModal()
  })
  document.getElementById('teleport-confirm-button').addEventListener('click', async () => {
    if (!pendingTeleport) return
    const button = document.getElementById('teleport-confirm-button')
    button.disabled = true
    try {
      const payload = await api.teleportPlayer({
        playerName: pendingTeleport.playerName,
        x: pendingTeleport.target.x,
        z: pendingTeleport.target.z,
        confirm: true,
      })
      hud.textContent = `已将 ${payload.playerName} 传送到 X ${payload.target.x} · Y ${payload.target.y} · Z ${payload.target.z}`
      closeTeleportModal()
      await loadLivePlayers()
    } catch (error) {
      hud.textContent = error.message
    } finally {
      button.disabled = false
    }
  })

  for (const button of document.querySelectorAll('[data-layer-toggle]')) {
    button.addEventListener('click', (event) => {
      event.preventDefault()
      const layer = button.getAttribute('data-layer-toggle')
      layerVisibility[layer] = !isLayerVisible(layer)
      hoveredMarker = null
      hideMarkerTooltip()
      renderLayerControls()
      draw()
    })
  }

  viewport.addEventListener('mousedown', (event) => {
    state.dragging = true
    state.dragMoved = false
    state.dragX = event.clientX
    state.dragY = event.clientY
    viewport.classList.add('dragging')
  })
  window.addEventListener('mouseup', () => {
    state.dragging = false
    viewport.classList.remove('dragging')
  })
  viewport.addEventListener('mousemove', (event) => {
    const rect = viewport.getBoundingClientRect()
    const mouseX = event.clientX - rect.left
    const mouseY = event.clientY - rect.top
    const [worldX, worldZ] = screenToWorld(mouseX, mouseY)
    document.getElementById('coord-readout').textContent = `X ${worldX.toFixed(1)} · Z ${worldZ.toFixed(1)}`
    if (!state.dragging) {
      hoveredMarker = findHoveredMarker(mouseX, mouseY)
      const hoverText = markerHoverText(hoveredMarker)
      if (hoverText) showMarkerTooltip(hoverText, mouseX, mouseY)
      else hideMarkerTooltip()
    } else {
      hoveredMarker = null
      hideMarkerTooltip()
    }
  })
  window.addEventListener('mousemove', (event) => {
    if (!state.dragging) return
    if (Math.abs(event.clientX - state.dragX) > 2 || Math.abs(event.clientY - state.dragY) > 2) state.dragMoved = true
    state.offsetX += event.clientX - state.dragX
    state.offsetY += event.clientY - state.dragY
    state.dragX = event.clientX
    state.dragY = event.clientY
    draw()
  })
  viewport.addEventListener('mouseleave', () => {
    hoveredMarker = null
    document.getElementById('coord-readout').textContent = 'X -- · Z --'
    hideMarkerTooltip()
  })
  viewport.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault()
      const rect = viewport.getBoundingClientRect()
      const mouseX = event.clientX - rect.left
      const mouseY = event.clientY - rect.top
      const [worldX, worldZ] = screenToWorld(mouseX, mouseY)
      const zoomFactor = event.deltaY < 0 ? 1.12 : 0.89
      state.scale = Math.max(0.02, Math.min(8, state.scale * zoomFactor))
      state.offsetX = mouseX - worldX * state.scale
      state.offsetY = mouseY - worldZ * state.scale
      draw()
    },
    { passive: false },
  )
  canvas.addEventListener('click', async (event) => {
    if (state.dragMoved) return
    const selected = selectedPlayer()
    if (!selected) {
      hud.textContent = '请先选择一名在线玩家。'
      return
    }
    const rect = viewport.getBoundingClientRect()
    const [worldX, worldZ] = screenToWorld(event.clientX - rect.left, event.clientY - rect.top)
    try {
      const preview = await api.teleportPreview(Math.round(worldX), Math.round(worldZ))
      openTeleportModal({ playerName: selected.name, target: preview.target })
    } catch (error) {
      hud.textContent = error.message
    }
  })
  window.addEventListener('resize', resizeCanvas)

  renderLayerControls()
  resizeCanvas()
  await loadMapData()
  await loadLivePlayers()
  setInterval(() => {
    loadMapData().catch(() => {})
  }, 30000)
  setInterval(() => {
    loadLivePlayers().catch(() => {})
  }, 5000)
}
