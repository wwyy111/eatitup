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

      {launcherMode === 'hotkey' && (
        <div className="hotkey-burst" aria-label="快捷键按钮">
          {hotkeyShortcuts.slice(0, 6).map((shortcut) => (
            <button
              key={shortcut.id}
              className="hotkey-burst-item"
              style={{ '--accent': shortcut.accent } as CSSProperties}
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation()
                window.electronAPI?.executeShortcut(shortcut.id)
              }}
              title={`${shortcut.name}: ${shortcut.target}`}
            >
              <span>{shortcut.name}</span>
              <kbd>{formatHotkeyLabel(shortcut.target)}</kbd>
            </button>
          ))}
        </div>
      )}

      {launcherMode === 'launch' && (
        <div className="floating-switcher" aria-label="快捷项切换">
        {enabledShortcuts.slice(0, 4).map((shortcut) => (
          <button
            key={shortcut.id}
            className={shortcut.id === activeShortcut?.id ? 'is-active' : ''}
            style={{ '--accent': shortcut.accent } as CSSProperties}
            type="button"
            onClick={() => switchShortcut(shortcut.id)}
            title={shortcut.name}
          >
            {shortcut.symbol.slice(0, 2)}
          </button>
        ))}
        </div>
      )}

      {launcherMode === 'launch' && (
        <button
          className="floating-config"
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation()
            window.electronAPI?.openMainWindow()
          }}
        >
          +
        </button>
      )}
    </div>
  )
}

export default FloatingButton
