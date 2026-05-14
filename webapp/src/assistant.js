import { api } from './api'
import { escapeHtml } from './shared'

const examplePrompts = [
  '给在线玩家每人一套钻石装备和 32 个熟牛排',
  '给某个玩家一把锋利很高的钻石剑',
  '在出生点旁边搭一个 9x9 的石砖平台',
]

function commandsMarkup(commands) {
  if (!commands.length) return '<div class="assistant-empty">这次没有可直接执行的服务器指令。</div>'
  return `<ol class="assistant-command-list">${commands.map((command) => `<li><code>${escapeHtml(command)}</code></li>`).join('')}</ol>`
}

function linesMarkup(lines, className) {
  if (!lines.length) return ''
  return `<ul class="${className}">${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>`
}

export function mountAssistant(root) {
  const state = {
    open: false,
    prompt: '',
    info: null,
    loadingInfo: true,
    planning: false,
    executing: false,
    error: '',
    notice: '',
    plan: null,
    selectedBackend: '',
  }

  function availableBackends() {
    return state.info?.availableBackends ?? []
  }

  function render() {
    const backends = availableBackends()
    const selectedBackend = state.selectedBackend || backends[0]?.key || ''
    const plan = state.plan
    root.innerHTML = `
      <div class="assistant-shell ${state.open ? 'open' : 'closed'}">
        <button class="assistant-fab" type="button" id="assistant-fab">${state.open ? '收起 AI 助手' : '打开 AI 助手'}</button>
        <section class="assistant-panel">
          <div class="assistant-header">
            <div>
              <div class="assistant-title">AI 服务器助手</div>
              <div class="assistant-subtitle">${backends.length ? `使用本地 ${escapeHtml(backends.find((item) => item.key === selectedBackend)?.label ?? backends[0].label)}` : '未检测到可用本地 CLI'}</div>
            </div>
            <button class="assistant-minimize" type="button" id="assistant-minimize">×</button>
          </div>
          <div class="assistant-body">
            <label class="assistant-label" for="assistant-backend">后端</label>
            <select class="assistant-select" id="assistant-backend" ${backends.length ? '' : 'disabled'}>
              ${backends.length ? backends.map((backend) => `<option value="${escapeHtml(backend.key)}" ${backend.key === selectedBackend ? 'selected' : ''}>${escapeHtml(backend.label)}</option>`).join('') : '<option>不可用</option>'}
            </select>
            <label class="assistant-label" for="assistant-prompt">想让服务器做什么？</label>
            <textarea class="assistant-textarea" id="assistant-prompt" placeholder="例如：给在线玩家每人 30 级经验，并给我一把高伤害钻石剑。">${escapeHtml(state.prompt)}</textarea>
            <div class="assistant-examples">
              ${examplePrompts.map((prompt) => `<button type="button" class="assistant-chip" data-prompt="${escapeHtml(prompt)}">${escapeHtml(prompt)}</button>`).join('')}
            </div>
            <div class="assistant-actions">
              <button class="button" id="assistant-plan-button" type="button" ${state.planning || !backends.length ? 'disabled' : ''}>${state.planning ? '生成中...' : '生成执行方案'}</button>
              <button class="button confirm" id="assistant-execute-button" type="button" ${state.executing || !plan || plan.status !== 'ready' || !plan.commands.length ? 'disabled' : ''}>${state.executing ? '执行中...' : '确认并执行'}</button>
            </div>
            ${state.error ? `<div class="assistant-banner error">${escapeHtml(state.error)}</div>` : ''}
            ${state.notice ? `<div class="assistant-banner success">${escapeHtml(state.notice)}</div>` : ''}
            ${state.loadingInfo ? '<div class="assistant-empty">正在检测本地 AI CLI...</div>' : ''}
            ${plan ? `
              <div class="assistant-result">
                <div class="assistant-result-head">
                  <span class="assistant-status ${escapeHtml(plan.status)}">${escapeHtml(plan.status)}</span>
                  <span class="assistant-meta">${escapeHtml(plan.backend)}</span>
                </div>
                <h3>${escapeHtml(plan.summary || '未生成摘要')}</h3>
                <p class="assistant-copy">${escapeHtml(plan.reasoning || '未提供说明')}</p>
                ${linesMarkup(plan.warnings || [], 'assistant-warning-list')}
                ${linesMarkup(plan.questions || [], 'assistant-question-list')}
                ${commandsMarkup(plan.commands || [])}
              </div>
            ` : ''}
          </div>
        </section>
      </div>
    `

    root.querySelector('#assistant-fab')?.addEventListener('click', () => {
      state.open = !state.open
      render()
    })
    root.querySelector('#assistant-minimize')?.addEventListener('click', () => {
      state.open = false
      render()
    })
    root.querySelector('#assistant-backend')?.addEventListener('change', (event) => {
      state.selectedBackend = event.target.value
      render()
    })
    root.querySelector('#assistant-prompt')?.addEventListener('input', (event) => {
      state.prompt = event.target.value
    })
    for (const button of root.querySelectorAll('[data-prompt]')) {
      button.addEventListener('click', () => {
        state.prompt = button.getAttribute('data-prompt') || ''
        state.open = true
        render()
      })
    }
    root.querySelector('#assistant-plan-button')?.addEventListener('click', async () => {
      if (!state.prompt.trim()) {
        state.error = '先输入你的需求。'
        state.notice = ''
        render()
        return
      }
      state.planning = true
      state.error = ''
      state.notice = ''
      render()
      try {
        const backend = state.selectedBackend || availableBackends()[0]?.key || undefined
        const payload = await api.agentPlan({ request: state.prompt.trim(), backend })
        state.plan = payload.plan
        state.notice = payload.plan.status === 'ready' ? '方案已生成，可以直接执行。' : '方案已生成，请先看说明。'
      } catch (error) {
        state.error = String(error?.message || error)
      } finally {
        state.planning = false
        state.open = true
        render()
      }
    })
    root.querySelector('#assistant-execute-button')?.addEventListener('click', async () => {
      if (!state.plan?.id) return
      if (!window.confirm(`确认执行这 ${state.plan.commands.length} 条服务器指令吗？`)) return
      state.executing = true
      state.error = ''
      state.notice = ''
      render()
      try {
        const payload = await api.agentExecute({ planId: state.plan.id, confirm: true })
        state.notice = `已送出 ${payload.executedCommandCount} 条服务器指令。`
      } catch (error) {
        state.error = String(error?.message || error)
      } finally {
        state.executing = false
        render()
      }
    })
  }

  render()
  api.agentInfo()
    .then((info) => {
      state.info = info
      state.selectedBackend = info.availableBackends?.[0]?.key || ''
    })
    .catch((error) => {
      state.error = String(error?.message || error)
    })
    .finally(() => {
      state.loadingInfo = false
      render()
    })
}
