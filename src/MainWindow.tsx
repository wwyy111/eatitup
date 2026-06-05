import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties, FormEvent, KeyboardEvent } from 'react'
import {
  AppWindow,
  ArrowSquareOut,
  CheckCircle,
  Command,
  GearSix,
  Keyboard,
  LinkSimple,
  Microphone,
  Play,
  Plus,
  Power,
  SidebarSimple,
  Sparkle,
  Trash
} from '@phosphor-icons/react'
import {
  DEFAULT_SHORTCUTS,
  SHORTCUT_KIND_LABEL,
  type LauncherMode,
  type Shortcut,
  type ShortcutKind
} from './shortcuts'

const colorOptions = ['#3370ff', '#22c55e', '#ff4d4f', '#f59e0b', '#7c3aed', '#0f766e']
const symbolOptions = ['rec', 'doc', 'bolt', 'app', 'link', 'key', 'spark']
const shortcutTypeOptions: Array<{ kind: ShortcutKind; label: string; icon: typeof LinkSimple }> = [
  { kind: 'url', label: '网页链接', icon: LinkSimple },
  { kind: 'app', label: '本机 App', icon: AppWindow },
  { kind: 'hotkey', label: '快捷键', icon: Keyboard }
]

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
    Meta: 'Command',
    OS: 'Command',
    Super: 'Command',
    Fn: '',
    fn: '',
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

function getShortcutIcon(shortcut: Shortcut) {
  if (shortcut.kind === 'feishu-record') return Microphone
  if (shortcut.kind === 'hotkey') return Keyboard
  if (shortcut.kind === 'app') return AppWindow
  return LinkSimple
}

function getShortcutDetail(shortcut: Shortcut) {
  if (shortcut.kind === 'hotkey') return formatHotkeyForDisplay(shortcut.target)
  if (shortcut.kind === 'feishu-record') return '打开飞书妙记并尝试开始录音'
  return shortcut.target
}

const MainWindow = () => {
  const [shortcuts, setShortcuts] = useState<Shortcut[]>(DEFAULT_SHORTCUTS)
  const [launcherMode, setLauncherMode] = useState<LauncherMode>('launch')
  const [draft, setDraft] = useState(emptyDraft)
  const [isSaving, setIsSaving] = useState(false)

  const enabledShortcuts = useMemo(
    () => shortcuts.filter((shortcut) => shortcut.enabled),
    [shortcuts]
  )

  const launchShortcutCount = useMemo(
    () => enabledShortcuts.filter((shortcut) => shortcut.kind !== 'hotkey').length,
    [enabledShortcuts]
  )

  const hotkeyShortcutCount = useMemo(
    () => enabledShortcuts.filter((shortcut) => shortcut.kind === 'hotkey').length,
    [enabledShortcuts]
  )

  useEffect(() => {
    let isMounted = true

    async function loadShortcuts() {
      const [storedShortcuts, storedLauncherMode] = await Promise.all([
        window.electronAPI?.getShortcuts() ?? Promise.resolve(DEFAULT_SHORTCUTS),
        window.electronAPI?.getLauncherMode() ?? Promise.resolve('launch' as LauncherMode)
      ])

      if (!isMounted) return
      setShortcuts(storedShortcuts)
      setLauncherMode(storedLauncherMode)
    }

    loadShortcuts()

    return () => {
      isMounted = false
      window.electronAPI?.setHotkeyRecording(false)
    }
  }, [])

  useEffect(() => {
    if (draft.kind !== 'hotkey') {
      window.electronAPI?.setHotkeyRecording(false)
    }
  }, [draft.kind])

  useEffect(() => {
    const unsubscribe = window.electronAPI?.onCapturedHotkey((hotkey) => {
      setDraft((currentDraft) => ({
        ...currentDraft,
        target: hotkey,
        symbol: currentDraft.symbol === 'bolt' ? 'key' : currentDraft.symbol
      }))
    })

    return () => unsubscribe?.()
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

  const handleToggleShortcut = async (shortcutId: string) => {
    const nextShortcuts = shortcuts.map((shortcut) => {
      if (shortcut.id !== shortcutId) return shortcut
      return { ...shortcut, enabled: !shortcut.enabled }
    })

    await persistShortcuts(nextShortcuts)
  }

  const handleDeleteShortcut = async (shortcutId: string) => {
    const shortcut = shortcuts.find((item) => item.id === shortcutId)
    if (!shortcut) return

    const shouldDelete = window.confirm(`删除「${shortcut.name}」？`)
    if (!shouldDelete) return

    const nextShortcuts = shortcuts.filter((item) => item.id !== shortcutId)

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

    if (['Meta', 'OS', 'Super', 'Shift', 'Alt', 'Control', 'Fn', 'fn'].includes(event.key)) {
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

  const handleHotkeyRecorderKeyUp = (event: KeyboardEvent<HTMLInputElement>) => {
    event.preventDefault()
    event.stopPropagation()
  }

  return (
    <main className="launcher-shell">
      <aside className="launcher-sidebar">
        <div className="brand-row">
          <div className="brand-mark" aria-hidden="true">
            <Sparkle weight="fill" />
          </div>
          <div>
            <h1>浮点启动台</h1>
            <span>Local</span>
          </div>
        </div>

        <nav className="launcher-nav" aria-label="启动台设置">
          <a className="is-active" href="#shortcuts">
            <SidebarSimple weight="bold" />
            工作台
          </a>
          <a href="#composer">
            <Plus weight="bold" />
            新建入口
          </a>
          <a href="#floating">
            <GearSix weight="bold" />
            悬浮球
          </a>
        </nav>

        <div className="sidebar-metrics" aria-label="快捷项统计">
          <div>
            <Power weight="bold" />
            <span>{enabledShortcuts.length}</span>
            <p>启用</p>
          </div>
          <div>
            <ArrowSquareOut weight="bold" />
            <span>{launchShortcutCount}</span>
            <p>启动</p>
          </div>
          <div>
            <Command weight="bold" />
            <span>{hotkeyShortcutCount}</span>
            <p>快捷键</p>
          </div>
        </div>
      </aside>

      <section className="launcher-content">
        <div className="launcher-page">
          <div className="launcher-toolbar">
            <div>
              <span className="toolbar-kicker">快捷项管理</span>
              <h2>新增、启停、管理快捷项</h2>
              <p>这里是悬浮球的配置中心：添加入口，维护快捷项，决定悬停时出现什么。</p>
            </div>
            <div className="mode-actions">
              <div className="segmented-control">
                <button
                  className={launcherMode === 'launch' ? 'is-selected' : ''}
                  type="button"
                  onClick={() => handleSetLauncherMode('launch')}
                >
                  <ArrowSquareOut weight="bold" />
                  启动
                </button>
                <button
                  className={launcherMode === 'hotkey' ? 'is-selected' : ''}
                  type="button"
                  onClick={() => handleSetLauncherMode('hotkey')}
                >
                  <Keyboard weight="bold" />
                  快捷键
                </button>
              </div>
            </div>
          </div>

          <div className="launcher-grid">
            <section className="config-panel" id="composer">
              <div className="section-heading">
                <div>
                  <h3>添加入口</h3>
                  <p>新增网页、App 或快捷键动作。</p>
                </div>
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

              <div className="kind-picker" role="radiogroup" aria-label="快捷项类型">
                {shortcutTypeOptions.map((option) => {
                  const OptionIcon = option.icon
                  return (
                    <button
                      key={option.kind}
                      className={draft.kind === option.kind ? 'is-selected' : ''}
                      type="button"
                      role="radio"
                      aria-checked={draft.kind === option.kind}
                      onClick={() => setDraft({ ...draft, kind: option.kind })}
                    >
                      <OptionIcon weight="bold" />
                      {option.label}
                    </button>
                  )
                })}
              </div>

              {draft.kind === 'hotkey' ? (
                <label>
                  快捷键组合
                  <input
                    className="hotkey-recorder"
                    value={draft.target ? formatHotkeyForDisplay(draft.target) : ''}
                    onKeyDown={handleRecordHotkey}
                    onKeyUp={handleHotkeyRecorderKeyUp}
                    onChange={() => undefined}
                    onFocus={(event) => {
                      window.electronAPI?.setHotkeyRecording(true)
                      event.currentTarget.select()
                    }}
                    onBlur={() => window.electronAPI?.setHotkeyRecording(false)}
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

              <button className="primary-action" type="submit">
                <CheckCircle weight="fill" />
                添加快捷项
              </button>

              <div className="form-split">
                <div>
                  <span className="field-label">颜色</span>
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
                </div>

                <div>
                  <span className="field-label">短标识</span>
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
                </div>
              </div>
              </form>
            </section>

            <section className="shortcut-panel" id="shortcuts">
              <div className="section-heading">
                <div>
                  <h3>已有快捷项</h3>
                  <p>点击运行，或在右侧停用、删除。</p>
                </div>
                <span>{enabledShortcuts.length} / {shortcuts.length} 启用</span>
              </div>

              <div className="shortcut-list">
                {shortcuts.length === 0 && (
                  <div className="empty-shortcut-state">
                    还没有快捷项
                  </div>
                )}

                {shortcuts.map((shortcut) => (
                  <article
                    className="shortcut-row"
                    key={shortcut.id}
                    style={{ '--accent': shortcut.accent } as CSSProperties}
                  >
                    <button
                      className="shortcut-identity"
                      type="button"
                      onClick={() => handleRunShortcut(shortcut.id)}
                    >
                      <span className="shortcut-icon">
                        {(() => {
                          const ShortcutIcon = getShortcutIcon(shortcut)
                          return <ShortcutIcon weight="bold" />
                        })()}
                      </span>
                      <span>
                        <strong>{shortcut.name}</strong>
                        <small>{SHORTCUT_KIND_LABEL[shortcut.kind]} · {getShortcutDetail(shortcut)}</small>
                      </span>
                    </button>

                    <div className="shortcut-actions">
                      <button type="button" onClick={() => handleRunShortcut(shortcut.id)}>
                        <Play weight="fill" />
                        运行
                      </button>
                      <button
                        className="danger-action"
                        type="button"
                        onClick={() => handleDeleteShortcut(shortcut.id)}
                        aria-label={`删除 ${shortcut.name}`}
                        title="删除"
                      >
                        <Trash weight="bold" />
                      </button>
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
          </div>
        </div>
      </section>
    </main>
  )
}

export default MainWindow
