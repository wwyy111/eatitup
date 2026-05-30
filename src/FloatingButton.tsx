import { type CSSProperties, type PointerEvent, useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_SHORTCUTS, type LauncherMode, type Shortcut } from './shortcuts'

const FloatingButton = () => {
  const [shortcuts, setShortcuts] = useState<Shortcut[]>(DEFAULT_SHORTCUTS)
  const [activeShortcutId, setActiveShortcutId] = useState(DEFAULT_SHORTCUTS[0].id)
  const [launcherMode, setLauncherMode] = useState<LauncherMode>('launch')
  const [isDragging, setIsDragging] = useState(false)
  const [isHovering, setIsHovering] = useState(false)
  const [isPressed, setIsPressed] = useState(false)
  const [pointerOffset, setPointerOffset] = useState({ x: 0, y: 0 })
  const pointerStartPos = useRef({ x: 0, y: 0 })
  const hasMoved = useRef(false)

  const enabledShortcuts = useMemo(
    () => shortcuts.filter((shortcut) => shortcut.enabled),
    [shortcuts]
  )

  const hotkeyShortcuts = useMemo(
    () => enabledShortcuts.filter((shortcut) => shortcut.kind === 'hotkey'),
    [enabledShortcuts]
  )

  const activeShortcut = useMemo(
    () => enabledShortcuts.find((shortcut) => shortcut.id === activeShortcutId) ?? enabledShortcuts[0] ?? shortcuts[0],
    [activeShortcutId, enabledShortcuts, shortcuts]
  )

  const burstShortcuts = launcherMode === 'hotkey'
    ? hotkeyShortcuts.slice(0, 6)
    : enabledShortcuts.slice(0, 6)

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
    const refreshTimer = window.setInterval(loadShortcuts, 2500)

    return () => {
      isMounted = false
      window.clearInterval(refreshTimer)
    }
  }, [])

  const runActiveShortcut = async () => {
    if (!activeShortcut) return
    await window.electronAPI?.executeShortcut(activeShortcut.id)
  }

  const switchShortcut = async (shortcutId: string) => {
    setActiveShortcutId(shortcutId)
    await window.electronAPI?.setActiveShortcut(shortcutId)
  }

  const toggleLauncherMode = async () => {
    const nextMode = launcherMode === 'hotkey' ? 'launch' : 'hotkey'
    setLauncherMode(nextMode)
    await window.electronAPI?.setLauncherMode(nextMode)
  }

  const stepShortcut = async (direction: 1 | -1) => {
    if (enabledShortcuts.length === 0) return

    const currentIndex = Math.max(0, enabledShortcuts.findIndex((shortcut) => shortcut.id === activeShortcut?.id))
    const nextIndex = (currentIndex + direction + enabledShortcuts.length) % enabledShortcuts.length
    await switchShortcut(enabledShortcuts[nextIndex].id)
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return

    event.currentTarget.setPointerCapture(event.pointerId)
    pointerStartPos.current = { x: event.screenX, y: event.screenY }
    hasMoved.current = false
    setIsDragging(true)
    setIsPressed(true)
    window.electronAPI?.startFloatingDrag({ x: event.screenX, y: event.screenY })
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - rect.left - rect.width / 2
    const y = event.clientY - rect.top - rect.height / 2
    setPointerOffset({
      x: Math.max(-18, Math.min(18, x)),
      y: Math.max(-18, Math.min(18, y))
    })

    if (!isDragging) return

    const dx = event.screenX - pointerStartPos.current.x
    const dy = event.screenY - pointerStartPos.current.y
    const moveDistance = Math.hypot(dx, dy)

    if (moveDistance >= 5) {
      hasMoved.current = true
    }

    window.electronAPI?.moveFloatingWindow({ x: event.screenX, y: event.screenY })
  }

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return

    event.currentTarget.releasePointerCapture(event.pointerId)
    setIsDragging(false)
    setIsPressed(false)
    window.electronAPI?.endFloatingDrag()

    if (!hasMoved.current && launcherMode === 'launch') {
      runActiveShortcut()
    }
  }

  const handlePointerLeave = () => {
    if (!isDragging) {
      setIsHovering(false)
      setPointerOffset({ x: 0, y: 0 })
    }
  }

  const dynamicStyle = {
    '--mx': `${pointerOffset.x}px`,
    '--my': `${pointerOffset.y}px`,
    '--tilt-x': `${pointerOffset.y * -0.35}deg`,
    '--tilt-y': `${pointerOffset.x * 0.35}deg`,
    '--accent': launcherMode === 'hotkey' ? '#f59e0b' : activeShortcut?.accent ?? '#3370ff'
  } as CSSProperties

  const formatHotkeyLabel = (target: string) => target
    .replace(/Command/g, '⌘')
    .replace(/Shift/g, '⇧')
    .replace(/Option/g, '⌥')
    .replace(/Control/g, '⌃')
    .replace(/\+/g, '')

  const handleHotkeyButtonPointerUp = (event: PointerEvent<HTMLButtonElement>, shortcutId: string) => {
    event.preventDefault()
    event.stopPropagation()
    window.electronAPI?.executeShortcut(shortcutId)
  }

  const handleLaunchButtonPointerUp = async (event: PointerEvent<HTMLButtonElement>, shortcutId: string) => {
    event.preventDefault()
    event.stopPropagation()
    await switchShortcut(shortcutId)
    await window.electronAPI?.executeShortcut(shortcutId)
  }

  const handleConfigPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    window.electronAPI?.openMainWindow()
  }

  const handleModeTogglePointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    toggleLauncherMode()
  }

  const getBurstButtonStyle = (index: number, total: number, accent: string) => {
    const radius = total <= 3 ? 70 : 78
    const startAngle = total <= 3 ? -140 : -155
    const endAngle = total <= 3 ? -40 : 155
    const angle = total === 1
      ? -90
      : startAngle + ((endAngle - startAngle) / (total - 1)) * index
    const radians = (angle * Math.PI) / 180

    return {
      '--accent': accent,
      '--burst-x': `${Math.cos(radians) * radius}px`,
      '--burst-y': `${Math.sin(radians) * radius}px`,
      '--burst-delay': `${index * 18}ms`
    } as CSSProperties
  }

  return (
    <div
      className={`floating-stage ${launcherMode === 'hotkey' ? 'is-hotkey-mode' : ''}`}
      onWheel={(event) => {
        event.preventDefault()
        stepShortcut(event.deltaY > 0 ? 1 : -1)
      }}
    >
      <div
        className={[
          'floating-button-container',
          launcherMode === 'hotkey' ? 'is-hotkey-mode' : '',
          isHovering ? 'is-hovering' : '',
          isDragging ? 'is-dragging' : '',
          isPressed ? 'is-pressed' : ''
        ].join(' ')}
        style={dynamicStyle}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerEnter={() => !isDragging && setIsHovering(true)}
        onPointerLeave={handlePointerLeave}
      >
        <div className="floating-orbit" />
        <div className="floating-glow" />
        <div className="floating-face">
          <span className="floating-symbol">
            {launcherMode === 'hotkey' ? '⌘' : activeShortcut?.symbol.slice(0, 2) ?? 'go'}
          </span>
          <span className="floating-pulse-dot" />
        </div>
      </div>

      <div className="floating-burst-ring" aria-label={launcherMode === 'hotkey' ? '快捷键按钮' : '快捷启动按钮'}>
        {burstShortcuts.map((shortcut, index) => (
          <button
            key={shortcut.id}
            className={`floating-burst-item ${shortcut.id === activeShortcut?.id ? 'is-active' : ''}`}
            style={getBurstButtonStyle(index, burstShortcuts.length, shortcut.accent)}
            type="button"
            onPointerDown={(event) => {
              event.stopPropagation()
            }}
            onPointerUp={(event) => {
              if (launcherMode === 'hotkey') {
                handleHotkeyButtonPointerUp(event, shortcut.id)
                return
              }

              handleLaunchButtonPointerUp(event, shortcut.id)
            }}
            title={launcherMode === 'hotkey' ? `${shortcut.name}: ${shortcut.target}` : shortcut.name}
          >
            <span>{shortcut.symbol.slice(0, 2)}</span>
            {launcherMode === 'hotkey' && <kbd>{formatHotkeyLabel(shortcut.target)}</kbd>}
          </button>
        ))}
      </div>

      <button
        className={`floating-mode-toggle ${launcherMode === 'hotkey' ? 'is-hotkey-mode' : ''}`}
        type="button"
        onPointerDown={(event) => {
          event.stopPropagation()
        }}
        onPointerUp={handleModeTogglePointerUp}
        title={launcherMode === 'hotkey' ? '切换到启动模式' : '切换到快捷键模式'}
      >
        {launcherMode === 'hotkey' ? '↗' : '⌘'}
      </button>

      <button
        className={`floating-config ${launcherMode === 'hotkey' ? 'is-hotkey-mode' : ''}`}
        type="button"
        onPointerDown={(event) => {
          event.stopPropagation()
        }}
        onPointerUp={handleConfigPointerUp}
        title="打开配置面板"
      >
        ⚙
      </button>
    </div>
  )
}

export default FloatingButton
