import './style.css'

import { renderMapPage } from './pages/map'
import { renderStatusPage } from './pages/status'

async function main() {
  const root = document.querySelector('#app')
  if (!root) return

  if (window.location.pathname === '/map') {
    await renderMapPage(root)
    return
  }

  await renderStatusPage(root)
}

main().catch((error) => {
  const root = document.querySelector('#app')
  if (!root) return
  root.innerHTML = `<main class="wrap"><section class="panel"><h2>页面加载失败</h2><p class="footer">${String(error?.message || error)}</p></section></main>`
})
