import './style.css'

import { mountAssistant } from './assistant'
import { renderMapPage } from './pages/map'
import { renderStatusPage } from './pages/status'

async function main() {
  const root = document.querySelector('#app')
  if (!root) return
  root.innerHTML = '<div id="page-root"></div><div id="assistant-root"></div>'
  const pageRoot = root.querySelector('#page-root')
  const assistantRoot = root.querySelector('#assistant-root')
  if (!pageRoot || !assistantRoot) return

  if (window.location.pathname === '/map') {
    await renderMapPage(pageRoot)
  } else {
    await renderStatusPage(pageRoot)
  }

  mountAssistant(assistantRoot)
}

main().catch((error) => {
  const root = document.querySelector('#app')
  if (!root) return
  root.innerHTML = `<main class="wrap"><section class="panel"><h2>页面加载失败</h2><p class="footer">${String(error?.message || error)}</p></section></main>`
})
