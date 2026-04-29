import { type CSSProperties, type PointerEvent, useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_SHORTCUTS, type Shortcut } from './shortcuts'

const FloatingButton = () => {
  const [shortcuts, setShortcuts] = useState<Shortcut[]>(DEFAULT_SHORTCUTS)
  const [activeShortcutId, setActiveShortcutId] = useState(DEFAULT_SHORTCUTS[0].id)
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

  const activeShortcut = useMemo(
    () => enabledShortcuts.find((shortcut) => shortcut.id === activeShortcutId) ?? enabledShortcuts[0] ?? shortcuts[0],
    [activeShortcutId, enabledShortcuts, shortcuts]
  )

  useEffect(() => {
    let isMounted = true

    async function loadShortcuts() {
      const [storedShortcuts, storedActiveShortcutId] = await Promise.all([
        window.electronAPI?.getShortcuts() ?? Promise.resolve(DEFAULT_SHORTCUTS),
        window.electronAPI?.getActiveShortcut() ?? Promise.resolve(DEFAULT_SHORTCUTS[0].id)
      ])

      if (!isMounted) return
      setShortcuts(storedShortcuts)
      setActiveShortcutId(storedActiveShortcutId)
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

    if (!hasMoved.current) {
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
    '--accent': activeShortcut?.accent ?? '#3370ff'
  } as CSSProperties

  return (
    <div
      className="floating-stage"
      onWheel={(event) => {
        event.preventDefault()
        stepShortcut(event.deltaY > 0 ? 1 : -1)
      }}
    >
      <div
        className={[
          'floating-button-container',
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
          <span className="floating-symbol">{activeShortcut?.symbol.slice(0, 2) ?? 'go'}</span>
          <span className="floating-pulse-dot" />
        </div>
      </div>

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

      <button className="floating-config" type="button" onClick={() => window.electronAPI?.openMainWindow()}>
        +
      </button>
    </div>
  )
}

export default FloatingButton
