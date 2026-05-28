import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties, FormEvent, KeyboardEvent } from 'react'
import {
  DEFAULT_SHORTCUTS,
  SHORTCUT_KIND_LABEL,
  type LauncherMode,
  type Shortcut,
  type ShortcutKind
} from './shortcuts'

const colorOptions = ['#3370ff', '#22c55e', '#ff4d4f', '#f59e0b', '#7c3aed', '#0f766e']
const symbolOptions = ['rec', 'doc', 'bolt', 'app', 'link', 'key', 'spark']

const emptyDraft = {
  name: '',
  kind: 'url' as ShortcutKind,
  target: '',
  accent: colorOptions[0],
  symbol: 'bolt',
  autoStartFeishuRecording: false
}

function createShortcutId(name: string) {
  const cleanName = name.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
  return `${cleanName || 'shortcut'}-${Date.now().toString(36)}`
}

function normalizeRecordedKey(key: string) {
  const keyMap: Record<string, string> = {
    ' ': 'Space',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Escape: 'Escape',
    Enter: 'Return',
    Backspace: 'Delete'
  }

  if (keyMap[key]) return keyMap[key]
  if (key.length === 1) return key.toUpperCase()
  return key
}

function formatHotkeyForDisplay(hotkey: string) {
  return hotkey
    .replace(/Command/g, '⌘')
    .replace(/Shift/g, '⇧')
    .replace(/Option/g, '⌥')
    .replace(/Control/g, '⌃')
    .replace(/\+/g, ' ')
}

const MainWindow = () => {
  const [shortcuts, setShortcuts] = useState<Shortcut[]>(DEFAULT_SHORTCUTS)
  const [activeShortcutId, setActiveShortcutId] = useState(DEFAULT_SHORTCUTS[0].id)
  const [launcherMode, setLauncherMode] = useState<LauncherMode>('launch')
  const [draft, setDraft] = useState(emptyDraft)
  const [isSaving, setIsSaving] = useState(false)

  const activeShortcut = useMemo(
    () => shortcuts.find((shortcut) => shortcut.id === activeShortcutId) ?? shortcuts[0],
    [activeShortcutId, shortcuts]
  )

  useEffect(() => {
    let isMounted = true

    async function loadShortcuts() {
      const [storedShortcuts, storedActiveShortcutId, storedLauncherMode] = await Promise.all([
        window.electronAPI?.getShortcuts() ?? Promise.resolve(DEFAULT_SHORTCUTS),
        window.electronAPI?.getActiveShortcut() ?? Promise.resolve(DEFAULT_SHORTCUTS[0].id),
        window.electronAPI?.getLauncherMode() ?? Promise.resolve('launch' as LauncherMode)
      ])

      if (!isMounted) return
      setShortcuts(storedShortcuts)
      setActiveShortcutId(storedActiveShortcutId)
      setLauncherMode(storedLauncherMode)
    }

    loadShortcuts()

    return () => {
      isMounted = false
    }
  }, [])

  const persistShortcuts = async (nextShortcuts: Shortcut[]) => {
    setIsSaving(true)
    const savedShortcuts = await window.electronAPI?.saveShortcuts(nextShortcuts)
    setShortcuts(savedShortcuts ?? nextShortcuts)
    setIsSaving(false)
  }

  const handleAddShortcut = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const name = draft.name.trim()
    const kind = draft.autoStartFeishuRecording ? 'feishu-record' : draft.kind
    const target = kind === 'feishu-record' ? 'FEISHU_MINUTES_HOME_URL' : draft.target.trim()
    if (!name || !target) return

    const nextShortcut: Shortcut = {
      id: createShortcutId(name),
      name,
      kind,
      target,
      accent: draft.accent,
      symbol: draft.symbol,
      enabled: true
    }

    await persistShortcuts([...shortcuts, nextShortcut])
    setDraft(emptyDraft)
  }

  const handleSetActiveShortcut = async (shortcutId: string) => {
    setActiveShortcutId(shortcutId)
    await window.electronAPI?.setActiveShortcut(shortcutId)
  }

  const handleToggleShortcut = async (shortcutId: string) => {
    const nextShortcuts = shortcuts.map((shortcut) => {
      if (shortcut.id !== shortcutId) return shortcut
      return { ...shortcut, enabled: !shortcut.enabled }
    })

    await persistShortcuts(nextShortcuts)
  }

  const handleRunShortcut = async (shortcutId: string) => {
    await window.electronAPI?.executeShortcut(shortcutId)
  }

  const handleSetLauncherMode = async (mode: LauncherMode) => {
    setLauncherMode(mode)
    await window.electronAPI?.setLauncherMode(mode)
  }

  const handleRecordHotkey = (event: KeyboardEvent<HTMLInputElement>) => {
    event.preventDefault()
    event.stopPropagation()

    if (['Meta', 'Shift', 'Alt', 'Control'].includes(event.key)) {
      return
    }

    const parts = [
      event.metaKey ? 'Command' : '',
      event.ctrlKey ? 'Control' : '',
      event.altKey ? 'Option' : '',
      event.shiftKey ? 'Shift' : '',
      normalizeRecordedKey(event.key)
    ].filter(Boolean)

    setDraft({ ...draft, target: parts.join('+'), symbol: draft.symbol === 'bolt' ? 'key' : draft.symbol })
  }

  return (
    <main className="launcher-shell">
      <aside className="launcher-sidebar">
        <div className="brand-mark" aria-hidden="true">浮</div>
        <div>
          <h1>浮点启动台</h1>
          <p>把常用入口收进一个可切换的悬浮球。</p>
        </div>
      </aside>

      <section className="launcher-content">
        <div className="launcher-toolbar">
          <div>
            <span className="eyebrow">当前模式</span>
            <h2>{launcherMode === 'hotkey' ? '快捷键模式' : activeShortcut?.name ?? '未选择'}</h2>
          </div>
          <div className="mode-actions">
            <div className="segmented-control">
              <button
                className={launcherMode === 'launch' ? 'is-selected' : ''}
                type="button"
                onClick={() => handleSetLauncherMode('launch')}
              >
                启动
              </button>
              <button
                className={launcherMode === 'hotkey' ? 'is-selected' : ''}
                type="button"
                onClick={() => handleSetLauncherMode('hotkey')}
              >
                快捷键
              </button>
            </div>
            <button
              className="primary-action"
              type="button"
              onClick={() => activeShortcut && handleRunShortcut(activeShortcut.id)}
            >
              运行
            </button>
          </div>
        </div>

        <div className="launcher-grid">
          <section className="shortcut-panel">
            <div className="section-heading">
              <h3>快捷项</h3>
              <span>{shortcuts.filter((shortcut) => shortcut.enabled).length} 个启用</span>
            </div>

            <div className="shortcut-list">
              {shortcuts.map((shortcut) => (
                <article
                  className={`shortcut-row ${shortcut.id === activeShortcutId ? 'is-active' : ''}`}
                  key={shortcut.id}
                  style={{ '--accent': shortcut.accent } as CSSProperties}
                >
                  <button
                    className="shortcut-identity"
                    type="button"
                    onClick={() => handleSetActiveShortcut(shortcut.id)}
                  >
                    <span className="shortcut-icon">{shortcut.symbol.slice(0, 2)}</span>
                    <span>
                      <strong>{shortcut.name}</strong>
                      <small>{SHORTCUT_KIND_LABEL[shortcut.kind]} · {shortcut.target}</small>
                    </span>
                  </button>

                  <div className="shortcut-actions">
                    <button type="button" onClick={() => handleRunShortcut(shortcut.id)}>运行</button>
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={shortcut.enabled}
                        onChange={() => handleToggleShortcut(shortcut.id)}
                      />
                      <span />
                    </label>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="config-panel">
            <div className="section-heading">
              <h3>添加入口</h3>
              <span>{isSaving ? '保存中' : '本地保存'}</span>
            </div>

            <form className="shortcut-form" onSubmit={handleAddShortcut}>
              <label>
                名称
                <input
                  value={draft.name}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  placeholder="例如：Notion 工作台"
                />
              </label>

              <label>
                类型
                <select
                  value={draft.kind}
                  onChange={(event) => setDraft({ ...draft, kind: event.target.value as ShortcutKind })}
                >
                  <option value="url">网页/平台链接</option>
                  <option value="app">本机 App</option>
                  <option value="hotkey">快捷键</option>
                </select>
              </label>

              {draft.kind === 'hotkey' ? (
                <label>
                  快捷键组合
                  <input
                    className="hotkey-recorder"
                    value={draft.target ? formatHotkeyForDisplay(draft.target) : ''}
                    onKeyDown={handleRecordHotkey}
                    onChange={() => undefined}
                    onFocus={(event) => event.currentTarget.select()}
                    placeholder="点这里，然后直接按下快捷键"
                    readOnly
                  />
                  <small className="field-hint">录制时不会触发这个快捷键，只会保存组合。</small>
                </label>
              ) : (
                <label>
                  {draft.kind === 'app' ? 'App 名称' : '链接'}
                  <input
                    value={draft.target}
                    onChange={(event) => setDraft({ ...draft, target: event.target.value })}
                    placeholder={draft.kind === 'app' ? '例如：Notion' : 'https://...'}
                  />
                </label>
              )}

              {draft.kind === 'url' && (
                <details className="advanced-settings">
                  <summary>高级设置</summary>
                  <label className="inline-option">
                    <input
                      type="checkbox"
                      checked={draft.autoStartFeishuRecording}
                      onChange={(event) => setDraft({ ...draft, autoStartFeishuRecording: event.target.checked })}
                    />
                    <span>打开飞书妙记后自动点击开始录音</span>
                  </label>
                </details>
              )}

              <div className="swatch-group" aria-label="颜色">
                {colorOptions.map((color) => (
                  <button
                    key={color}
                    className={draft.accent === color ? 'is-selected' : ''}
                    style={{ background: color }}
                    type="button"
                    onClick={() => setDraft({ ...draft, accent: color })}
                    aria-label={color}
                  />
                ))}
              </div>

              <div className="symbol-grid">
                {symbolOptions.map((symbol) => (
                  <button
                    key={symbol}
                    className={draft.symbol === symbol ? 'is-selected' : ''}
                    type="button"
                    onClick={() => setDraft({ ...draft, symbol })}
                  >
                    {symbol}
                  </button>
                ))}
              </div>

              <button className="primary-action" type="submit">
                添加快捷项
              </button>
            </form>
          </section>
        </div>
      </section>
    </main>
  )
}

export default MainWindow
