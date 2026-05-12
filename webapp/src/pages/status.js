import { api } from '../api'
import { escapeHtml, uptimeText } from '../shared'

function card(label, value, detail) {
  return `<article class="card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><p>${escapeHtml(detail)}</p></article>`
}

function renderSnapshot(snapshot) {
  const maxPlayers = snapshot.maxPlayers ?? '未知'
  const players = snapshot.playersOnline.length
    ? snapshot.playersOnline.map((name) => `<li>${escapeHtml(name)}</li>`).join('')
    : '<li>当前无人在线</li>'

  return `
    <main class="wrap">
      <header class="topbar">
        <div class="brand">Minecraft 服管</div>
        <nav class="nav">
          <a class="nav-link active" href="/">状态</a>
          <a class="nav-link" href="/map">地图</a>
        </nav>
      </header>
      <section class="hero">
        <div class="eyebrow">Minecraft 基础状态</div>
        <h1>${escapeHtml(snapshot.serverName)}</h1>
        <p class="lead">这是当前 Bedrock 服务器的实时状态页，集中展示在线人数、世界时间、版本和端口等基础信息。</p>
        <div class="hero-meta">
          <div class="pill">世界：${escapeHtml(snapshot.levelName)}</div>
          <div class="pill">运行时长：${escapeHtml(uptimeText(snapshot.uptimeSeconds))}</div>
          <div class="pill">最近刷新：<span id="last-updated">${escapeHtml(snapshot.lastUpdated)}</span></div>
          <a class="pill" href="/map">打开地图页</a>
        </div>
      </section>
      <section class="grid">
        ${[
          card('在线玩家', `${snapshot.playerCount}/${maxPlayers}`, '来自 Bedrock 控制台日志'),
          card('游戏天数', String(snapshot.daysElapsed ?? '不可用'), `世界时间：${snapshot.timeOfDay ?? '不可用'}`),
          card('版本', snapshot.version, `${snapshot.gamemode} · ${snapshot.difficulty}`),
          card('端口', snapshot.gameplayPort, `局域网发现：${snapshot.lanPort ?? '关闭'}`),
        ].join('')}
      </section>
      <section class="section">
        <article class="panel">
          <h2>在线玩家</h2>
          <ul>${players}</ul>
        </article>
        <article class="panel">
          <h2>服务器信息</h2>
          <div class="kv">
            <div><span>游戏端口</span><strong>${escapeHtml(snapshot.gameplayPort)}</strong></div>
            <div><span>局域网端口</span><strong>${escapeHtml(snapshot.lanPort ?? '关闭')}</strong></div>
            <div><span>游戏模式</span><strong>${escapeHtml(snapshot.gamemode)}</strong></div>
            <div><span>难度</span><strong>${escapeHtml(snapshot.difficulty)}</strong></div>
          </div>
          <p class="footer">状态信息每 15 秒自动刷新一次，来源于 Bedrock 控制台日志、世界元数据和服务器配置。</p>
        </article>
      </section>
    </main>
  `
}

export async function renderStatusPage(root) {
  document.body.className = 'page-status'
  root.innerHTML = '<main class="wrap"><div class="panel">加载中...</div></main>'

  const refresh = async () => {
    const snapshot = await api.status()
    document.title = `${snapshot.serverName} · 服务器状态`
    root.innerHTML = renderSnapshot(snapshot)
  }

  await refresh()
  setInterval(() => {
    refresh().catch(() => {})
  }, 15000)
}
