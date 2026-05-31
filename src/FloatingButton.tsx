import { type CSSProperties, type PointerEvent, useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_SHORTCUTS, type LauncherMode, type Shortcut } from './shortcuts'

const TEAR_DISABLE_DISTANCE = 46
const CLICK_EXECUTE_DISTANCE = 6
const MAIN_BUTTON_HIT_RADIUS = 42
const SMALL_BUTTON_HIT_RADIUS = 24
const BURST_BUTTON_HIT_RADIUS = 28
const EXPANDED_KEEPALIVE_RADIUS = 126

type TearState = {
  shortcutId: string
  pointerId: number
  offsetX: number
  offsetY: number
  isPastThreshold: boolean
} | null

const FloatingButton = () => {
  const [shortcuts, setShortcuts] = useState<Shortcut[]>(DEFAULT_SHORTCUTS)
  const [activeShortcutId, setActiveShortcutId] = useState(DEFAULT_SHORTCUTS[0].id)
  const [launcherMode, setLauncherMode] = useState<LauncherMode>('launch')
  const [isDragging, setIsDragging] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [isHovering, setIsHovering] = useState(false)
  const [isPressed, setIsPressed] = useState(false)
  const [absorbedName, setAbsorbedName] = useState('')
  const [pointerOffset, setPointerOffset] = useState({ x: 0, y: 0 })
  const [tearState, setTearState] = useState<TearState>(null)
  const pointerStartPos = useRef({ x: 0, y: 0 })
  const hasMoved = useRef(false)
  const tearStartPos = useRef({ x: 0, y: 0 })
  const isDraggingRef = useRef(false)
  const isExpandedRef = useRef(false)
  const tearStateRef = useRef<TearState>(null)
  const isMousePassthroughRef = useRef<boolean | null>(null)
  const burstShortcutsRef = useRef<Shortcut[]>([])

  const enabledShortcuts = useMemo(
    () => shortcuts.filter((shortcut) => shortcut.enabled),
    [shortcuts]
  )

  const hotkeyShortcuts = useMemo(
    () => enabledShortcuts.filter((shortcut) => shortcut.kind === 'hotkey'),
    [enabledShortcuts]
  )

  const launchShortcuts = useMemo(
    () => enabledShortcuts.filter((shortcut) => shortcut.kind !== 'hotkey'),
    [enabledShortcuts]
  )

  const activeShortcut = useMemo(
    () => launchShortcuts.find((shortcut) => shortcut.id === activeShortcutId) ?? launchShortcuts[0],
    [activeShortcutId, launchShortcuts]
  )

  const burstShortcuts = launcherMode === 'hotkey'
    ? hotkeyShortcuts.slice(0, 6)
    : launchShortcuts.slice(0, 6)

  burstShortcutsRef.current = burstShortcuts
  isExpandedRef.current = isExpanded
  isDraggingRef.current = isDragging
  tearStateRef.current = tearState

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
    const unsubscribeAbsorbed = window.electronAPI?.onShortcutAbsorbed((name) => {
      setAbsorbedName(name)
      loadShortcuts()
      window.setTimeout(() => setAbsorbedName(''), 1400)
    })
    const refreshTimer = window.setInterval(loadShortcuts, 2500)

    return () => {
      isMounted = false
      unsubscribeAbsorbed?.()
      window.clearInterval(refreshTimer)
    }
  }, [])

  useEffect(() => {
    setMousePassthrough(true)

    return () => {
      setMousePassthrough(false)
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

  const disableShortcut = async (shortcutId: string) => {
    const nextShortcuts = shortcuts.map((shortcut) => (
      shortcut.id === shortcutId ? { ...shortcut, enabled: false } : shortcut
    ))
    const nextEnabledShortcuts = nextShortcuts.filter((shortcut) => shortcut.enabled)
    const nextLaunchShortcut = nextEnabledShortcuts.find((shortcut) => shortcut.kind !== 'hotkey')
      ?? nextEnabledShortcuts[0]

    setShortcuts(nextShortcuts)
    await window.electronAPI?.saveShortcuts(nextShortcuts)

    if (activeShortcutId === shortcutId && nextLaunchShortcut) {
      setActiveShortcutId(nextLaunchShortcut.id)
      await window.electronAPI?.setActiveShortcut(nextLaunchShortcut.id)
    }
  }

  const toggleLauncherMode = async () => {
    const nextMode = launcherMode === 'hotkey' ? 'launch' : 'hotkey'
    setLauncherMode(nextMode)
    await window.electronAPI?.setLauncherMode(nextMode)
  }

  const setMousePassthrough = (isPassthrough: boolean) => {
    if (isMousePassthroughRef.current === isPassthrough) {
      return
    }

    isMousePassthroughRef.current = isPassthrough
    window.electronAPI?.setFloatingMousePassthrough(isPassthrough)
  }

  const stepShortcut = async (direction: 1 | -1) => {
    const stepShortcuts = launcherMode === 'hotkey' ? hotkeyShortcuts : launchShortcuts
    if (stepShortcuts.length === 0) return

    const currentIndex = Math.max(0, stepShortcuts.findIndex((shortcut) => shortcut.id === activeShortcutId))
    const nextIndex = (currentIndex + direction + stepShortcuts.length) % stepShortcuts.length
    await switchShortcut(stepShortcuts[nextIndex].id)
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

  const handleBurstButtonPointerDown = (event: PointerEvent<HTMLButtonElement>, shortcutId: string) => {
    if (event.button !== 0) return

    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    tearStartPos.current = { x: event.screenX, y: event.screenY }
    setTearState({
      shortcutId,
      pointerId: event.pointerId,
      offsetX: 0,
      offsetY: 0,
      isPastThreshold: false
    })
  }

  const handleBurstButtonPointerMove = (event: PointerEvent<HTMLButtonElement>, shortcutId: string) => {
    if (!tearState || tearState.shortcutId !== shortcutId || tearState.pointerId !== event.pointerId) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    const offsetX = event.screenX - tearStartPos.current.x
    const offsetY = event.screenY - tearStartPos.current.y
    const distance = Math.hypot(offsetX, offsetY)

    setTearState({
      shortcutId,
      pointerId: event.pointerId,
      offsetX,
      offsetY,
      isPastThreshold: distance >= TEAR_DISABLE_DISTANCE
    })
  }

  const handleBurstButtonPointerUp = async (event: PointerEvent<HTMLButtonElement>, shortcutId: string) => {
    event.preventDefault()
    event.stopPropagation()

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    const currentTearState = tearState
    setTearState(null)

    if (currentTearState?.shortcutId === shortcutId && currentTearState.isPastThreshold) {
      await disableShortcut(shortcutId)
      return
    }

    if (
      currentTearState?.shortcutId === shortcutId
      && Math.hypot(currentTearState.offsetX, currentTearState.offsetY) >= CLICK_EXECUTE_DISTANCE
    ) {
      return
    }

    if (launcherMode === 'hotkey') {
      handleHotkeyButtonPointerUp(event, shortcutId)
      return
    }

    await handleLaunchButtonPointerUp(event, shortcutId)
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

  const getBurstButtonOffset = (index: number, total: number) => {
    const radius = total <= 3 ? 70 : 78
    const startAngle = total <= 3 ? -140 : -155
    const endAngle = total <= 3 ? -40 : 155
    const angle = total === 1
      ? -90
      : startAngle + ((endAngle - startAngle) / (total - 1)) * index
    const radians = (angle * Math.PI) / 180

    return {
      x: Math.cos(radians) * radius,
      y: Math.sin(radians) * radius
    }
  }

  useEffect(() => {
    const getDistance = (
      point: { x: number; y: number },
      target: { x: number; y: number }
    ) => Math.hypot(point.x - target.x, point.y - target.y)

    const handleMouseMove = (event: MouseEvent) => {
      const center = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
      const point = { x: event.clientX, y: event.clientY }
      const isOverMainButton = getDistance(point, center) <= MAIN_BUTTON_HIT_RADIUS
      const shouldStayExpanded = isExpandedRef.current
        && getDistance(point, center) <= EXPANDED_KEEPALIVE_RADIUS

      let isOverControl = isOverMainButton

      if (isExpandedRef.current || shouldStayExpanded || isOverMainButton) {
        const modeCenter = { x: center.x - 50, y: center.y + 58 }
        const configCenter = { x: center.x + 50, y: center.y + 58 }
        const isOverMode = getDistance(point, modeCenter) <= SMALL_BUTTON_HIT_RADIUS
        const isOverConfig = getDistance(point, configCenter) <= SMALL_BUTTON_HIT_RADIUS
        const isOverBurst = burstShortcutsRef.current.some((_shortcut, index) => {
          const offset = getBurstButtonOffset(index, burstShortcutsRef.current.length)
          return getDistance(point, { x: center.x + offset.x, y: center.y + offset.y }) <= BURST_BUTTON_HIT_RADIUS
        })

        isOverControl = isOverControl || isOverMode || isOverConfig || isOverBurst
      }

      const nextExpanded = isDraggingRef.current
        || Boolean(tearStateRef.current)
        || isOverMainButton
        || shouldStayExpanded
        || isOverControl

      setIsExpanded(nextExpanded)
      setIsHovering(isOverMainButton)
      setMousePassthrough(!(isDraggingRef.current || Boolean(tearStateRef.current) || isOverControl))
    }

    const handleMouseLeave = () => {
      if (!isDraggingRef.current && !tearStateRef.current) {
        setIsExpanded(false)
        setIsHovering(false)
        setMousePassthrough(true)
      }
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseleave', handleMouseLeave)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseleave', handleMouseLeave)
    }
  }, [])

  const getTearStyle = (shortcutId: string) => {
    if (tearState?.shortcutId !== shortcutId) {
      return {}
    }

    return {
      '--tear-x': `${tearState.offsetX}px`,
      '--tear-y': `${tearState.offsetY}px`
    } as CSSProperties
  }

  return (
    <div
      className={[
        'floating-stage',
        launcherMode === 'hotkey' ? 'is-hotkey-mode' : '',
        isExpanded ? 'is-expanded' : ''
      ].join(' ')}
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
          isPressed ? 'is-pressed' : '',
          absorbedName ? 'is-absorbing' : ''
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
            className={[
              'floating-burst-item',
              shortcut.id === activeShortcut?.id ? 'is-active' : '',
              tearState?.shortcutId === shortcut.id ? 'is-tearing' : '',
              tearState?.shortcutId === shortcut.id && tearState.isPastThreshold ? 'is-removing' : ''
            ].filter(Boolean).join(' ')}
            style={{
              ...getBurstButtonStyle(index, burstShortcuts.length, shortcut.accent),
              ...getTearStyle(shortcut.id)
            }}
            type="button"
            onPointerDown={(event) => handleBurstButtonPointerDown(event, shortcut.id)}
            onPointerMove={(event) => handleBurstButtonPointerMove(event, shortcut.id)}
            onPointerUp={(event) => handleBurstButtonPointerUp(event, shortcut.id)}
            onPointerCancel={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId)
              }
              setTearState(null)
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

      {absorbedName && (
        <div className="floating-absorb-toast">
          {absorbedName.slice(0, 10)}
        </div>
      )}
    </div>
  )
}

export default FloatingButton
