import { api } from './api'
import { escapeHtml } from './shared'

const examplePrompts = [
  '给在线玩家每人一套钻石装备和 32 个熟牛排',
  '给某个玩家一把锋利很高的钻石剑',
  '在出生点旁边搭一个 9x9 的石砖平台',
]

export function mountAssistant(root) {
  const state = {
    open: false,
    prompt: '',
    submitting: false,
    error: '',
    notice: '',
  }

  function render() {
    root.innerHTML = `
      <div class="assistant-shell ${state.open ? 'open' : 'closed'}">
        <button class="assistant-fab" type="button" id="assistant-fab">${state.open ? '收起 AI 助手' : '打开 AI 助手'}</button>
        <section class="assistant-panel">
          <div class="assistant-header">
            <div>
              <div class="assistant-title">AI 服务器助手</div>
              <div class="assistant-subtitle">把玩家需求写入 TODO，等待后续 agent 自动处理</div>
            </div>
            <button class="assistant-minimize" type="button" id="assistant-minimize">×</button>
          </div>
          <div class="assistant-body">
            <label class="assistant-label" for="assistant-prompt">想让服务器做什么？</label>
            <textarea class="assistant-textarea" id="assistant-prompt" placeholder="例如：给在线玩家每人 30 级经验，并给我一把高伤害钻石剑。">${escapeHtml(state.prompt)}</textarea>
            <div class="assistant-examples">
              ${examplePrompts.map((prompt) => `<button type="button" class="assistant-chip" data-prompt="${escapeHtml(prompt)}">${escapeHtml(prompt)}</button>`).join('')}
            </div>
            <div class="assistant-actions">
              <button class="button confirm" id="assistant-submit-button" type="button" ${state.submitting ? 'disabled' : ''}>${state.submitting ? '提交中...' : '提交给后续 agent'}</button>
            </div>
            ${state.error ? `<div class="assistant-banner error">${escapeHtml(state.error)}</div>` : ''}
            ${state.notice ? `<div class="assistant-banner success">${escapeHtml(state.notice)}</div>` : ''}
            <div class="assistant-empty">提交后，需求会写入 TODO 的“下一步任务”，并要求执行完成后通过 mcsvr 广播结果。</div>
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
    root.querySelector('#assistant-submit-button')?.addEventListener('click', async () => {
      if (!state.prompt.trim()) {
        state.error = '先输入你的需求。'
        state.notice = ''
        render()
        return
      }
      state.submitting = true
      state.error = ''
      state.notice = ''
      render()
      try {
        await api.agentRequest({ request: state.prompt.trim() })
        state.notice = '已加入 TODO 的下一步任务，后续 agent 会处理并广播结果。'
        state.prompt = ''
      } catch (error) {
        state.error = String(error?.message || error)
      } finally {
        state.submitting = false
        state.open = true
        render()
      }
    })
  }

  render()
}
