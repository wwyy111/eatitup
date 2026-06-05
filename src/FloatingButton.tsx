import { type CSSProperties, type PointerEvent, useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_SHORTCUTS, type LauncherMode, type Shortcut } from './shortcuts'

const TEAR_DISABLE_DISTANCE = 46
const CLICK_EXECUTE_DISTANCE = 6
const LONG_PRESS_DELAY = 420
const UTILITY_SELECT_DISTANCE = 26
const MAIN_BUTTON_HIT_RADIUS = 42
const SMALL_BUTTON_HIT_RADIUS = 24
const BURST_BUTTON_HIT_RADIUS = 28
const EXPANDED_KEEPALIVE_RADIUS = 146
const BUTTON_EDGE_MARGIN = 32
const EDGE_ADAPT_THRESHOLD = 168
const FLOATING_CONTROL_MIN_DISTANCE = 58
const UTILITY_CONTROL_MIN_DISTANCE = 48
const UTILITY_SCREEN_MARGIN = 24

type TearState = {
  shortcutId: string
  pointerId: number
  offsetX: number
  offsetY: number
  isPastThreshold: boolean
} | null

type FloatingEdgeLayout = {
  isNearLeft: boolean
  isNearRight: boolean
  isNearTop: boolean
  isNearBottom: boolean
}

type DragMotion = {
  angle: number
  pull: number
  scaleX: number
  scaleY: number
  shiftX: number
  shiftY: number
}

const IDLE_DRAG_MOTION: DragMotion = {
  angle: 0,
  pull: 0,
  scaleX: 1,
  scaleY: 1,
  shiftX: 0,
  shiftY: 0
}

const FloatingButton = () => {
  const [shortcuts, setShortcuts] = useState<Shortcut[]>(DEFAULT_SHORTCUTS)
  const [launcherMode, setLauncherMode] = useState<LauncherMode>('launch')
  const [isDragging, setIsDragging] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [isUtilityPicking, setIsUtilityPicking] = useState(false)
  const [selectedUtility, setSelectedUtility] = useState<'mode' | 'config' | null>(null)
  const [isHovering, setIsHovering] = useState(false)
  const [isPressed, setIsPressed] = useState(false)
  const [slimeFeedback, setSlimeFeedback] = useState<'execute' | 'mode' | 'absorb' | null>(null)
  const [isRebounding, setIsRebounding] = useState(false)
  const [dragMotion, setDragMotion] = useState<DragMotion>(IDLE_DRAG_MOTION)
  const [absorbedName, setAbsorbedName] = useState('')
  const [pointerOffset, setPointerOffset] = useState({ x: 0, y: 0 })
  const [buttonPosition, setButtonPosition] = useState(() => ({
    x: window.innerWidth / 2,
    y: window.innerHeight / 2
  }))
  const [tearState, setTearState] = useState<TearState>(null)
  const floatingButtonRef = useRef<HTMLDivElement | null>(null)
  const pointerStartPos = useRef({ x: 0, y: 0 })
  const buttonStartPos = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
  const buttonPositionRef = useRef(buttonPosition)
  const activePointerIdRef = useRef<number | null>(null)
  const hasMoved = useRef(false)
  const tearStartPos = useRef({ x: 0, y: 0 })
  const isDraggingRef = useRef(false)
  const isExpandedRef = useRef(false)
  const isUtilityPickingRef = useRef(false)
  const selectedUtilityRef = useRef<'mode' | 'config' | null>(null)
  const launcherModeRef = useRef<LauncherMode>(launcherMode)
  const dragMotionRef = useRef<DragMotion>(IDLE_DRAG_MOTION)
  const dragMoveSequenceRef = useRef(0)
  const longPressTimerRef = useRef<number | null>(null)
  const feedbackTimerRef = useRef<number | null>(null)
  const reboundTimerRef = useRef<number | null>(null)
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

  const burstShortcuts = launcherMode === 'hotkey'
    ? hotkeyShortcuts.slice(0, 6)
    : launchShortcuts.slice(0, 6)

  burstShortcutsRef.current = burstShortcuts
  isExpandedRef.current = isExpanded
  isDraggingRef.current = isDragging
  isUtilityPickingRef.current = isUtilityPicking
  selectedUtilityRef.current = selectedUtility
  tearStateRef.current = tearState
  buttonPositionRef.current = buttonPosition
  launcherModeRef.current = launcherMode
  dragMotionRef.current = dragMotion

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
    const unsubscribeAbsorbed = window.electronAPI?.onShortcutAbsorbed((name) => {
      setAbsorbedName(name)
      triggerSlimeFeedback('absorb')
      loadShortcuts()
      window.setTimeout(() => setAbsorbedName(''), 1400)
    })
    const refreshTimer = window.setInterval(loadShortcuts, 2500)

    return () => {
      isMounted = false
      unsubscribeAbsorbed?.()
      window.clearInterval(refreshTimer)
      clearLongPressTimer()
      clearFeedbackTimer()
      clearReboundTimer()
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    window.electronAPI?.getFloatingPosition()
      .then((position) => {
        if (!isMounted || !position) return
        const nextPosition = clampButtonPosition(position)
        setButtonPosition(nextPosition)
        buttonPositionRef.current = nextPosition
      })
      .catch(() => undefined)

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    setMousePassthrough(true)

    return () => {
      setMousePassthrough(false)
    }
  }, [])

  const disableShortcut = async (shortcutId: string) => {
    const nextShortcuts = shortcuts.map((shortcut) => (
      shortcut.id === shortcutId ? { ...shortcut, enabled: false } : shortcut
    ))

    setShortcuts(nextShortcuts)
    await window.electronAPI?.saveShortcuts(nextShortcuts)
  }

  const toggleLauncherMode = async () => {
    const nextMode = launcherModeRef.current === 'hotkey' ? 'launch' : 'hotkey'
    triggerSlimeFeedback('mode')
    setLauncherMode(nextMode)
    launcherModeRef.current = nextMode
    await window.electronAPI?.setLauncherMode(nextMode)
  }

  const setMousePassthrough = (isPassthrough: boolean) => {
    if (isMousePassthroughRef.current === isPassthrough) {
      return
    }

    isMousePassthroughRef.current = isPassthrough
    window.electronAPI?.setFloatingMousePassthrough(isPassthrough)
  }

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current === null) return
    window.clearTimeout(longPressTimerRef.current)
    longPressTimerRef.current = null
  }

  const clearFeedbackTimer = () => {
    if (feedbackTimerRef.current === null) return
    window.clearTimeout(feedbackTimerRef.current)
    feedbackTimerRef.current = null
  }

  const clearReboundTimer = () => {
    if (reboundTimerRef.current === null) return
    window.clearTimeout(reboundTimerRef.current)
    reboundTimerRef.current = null
  }

  const triggerSlimeFeedback = (feedback: 'execute' | 'mode' | 'absorb') => {
    clearFeedbackTimer()
    setSlimeFeedback(feedback)
    feedbackTimerRef.current = window.setTimeout(() => {
      setSlimeFeedback(null)
      feedbackTimerRef.current = null
    }, feedback === 'absorb' ? 760 : 520)
  }

  const clampButtonPosition = (position: { x: number; y: number }) => ({
    x: Math.max(BUTTON_EDGE_MARGIN, Math.min(window.innerWidth - BUTTON_EDGE_MARGIN, position.x)),
    y: Math.max(BUTTON_EDGE_MARGIN, Math.min(window.innerHeight - BUTTON_EDGE_MARGIN, position.y))
  })

  const getDragMotion = (dx: number, dy: number): DragMotion => {
    const distance = Math.hypot(dx, dy)
    if (distance < 1) return IDLE_DRAG_MOTION

    const pull = Math.min(14, distance * 0.09)
    const angle = Math.atan2(dy, dx) * (180 / Math.PI)
    const lag = Math.min(5.5, pull * 0.34)
    const directionX = dx / distance
    const directionY = dy / distance

    return {
      angle,
      pull,
      scaleX: 1.02 + pull * 0.012,
      scaleY: Math.max(0.9, 1 - pull * 0.006),
      shiftX: directionX * -lag,
      shiftY: directionY * -lag
    }
  }

  const setNextDragMotion = (motion: DragMotion) => {
    dragMotionRef.current = motion
    setDragMotion(motion)
  }

  const startDragRebound = () => {
    if (dragMotionRef.current.pull < 1) return

    clearReboundTimer()
    setIsRebounding(true)
    reboundTimerRef.current = window.setTimeout(() => {
      setIsRebounding(false)
      setNextDragMotion(IDLE_DRAG_MOTION)
      reboundTimerRef.current = null
    }, 360)
  }

  const stepShortcut = async (direction: 1 | -1) => {
    const stepShortcuts = launcherMode === 'hotkey' ? hotkeyShortcuts : launchShortcuts
    if (stepShortcuts.length === 0) return

    const nextIndex = direction > 0 ? 0 : stepShortcuts.length - 1
    await window.electronAPI?.executeShortcut(stepShortcuts[nextIndex].id)
  }

  const finishMainDrag = (pointerId = activePointerIdRef.current) => {
    if (!isDraggingRef.current && !isUtilityPickingRef.current) return

    const wasUtilityPicking = isUtilityPickingRef.current
    const pickedUtility = selectedUtilityRef.current
    const shouldRebound = hasMoved.current && !wasUtilityPicking
    const buttonElement = floatingButtonRef.current

    if (pointerId !== null && buttonElement?.hasPointerCapture(pointerId)) {
      buttonElement.releasePointerCapture(pointerId)
    }

    clearLongPressTimer()
    activePointerIdRef.current = null
    isDraggingRef.current = false
    isUtilityPickingRef.current = false
    selectedUtilityRef.current = null

    setIsDragging(false)
    setIsPressed(false)
    setIsUtilityPicking(false)
    setSelectedUtility(null)
    setPointerOffset({ x: 0, y: 0 })

    window.electronAPI?.endFloatingDrag(buttonPositionRef.current)
    window.electronAPI?.setFloatingPosition(buttonPositionRef.current).catch(() => undefined)

    if (shouldRebound) {
      startDragRebound()
    } else {
      setNextDragMotion(IDLE_DRAG_MOTION)
    }

    if (wasUtilityPicking) {
      if (pickedUtility === 'config') {
        window.electronAPI?.openMainWindow()
      }

      if (pickedUtility === 'mode') {
        toggleLauncherMode()
      }
    }
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return

    event.currentTarget.setPointerCapture(event.pointerId)
    activePointerIdRef.current = event.pointerId
    pointerStartPos.current = { x: event.screenX, y: event.screenY }
    buttonStartPos.current = buttonPositionRef.current
    hasMoved.current = false
    isDraggingRef.current = true
    setIsDragging(true)
    setIsPressed(true)
    setIsRebounding(false)
    clearReboundTimer()
    setNextDragMotion(IDLE_DRAG_MOTION)
    setSelectedUtility(null)
    clearLongPressTimer()
    longPressTimerRef.current = window.setTimeout(() => {
      if (hasMoved.current || !isDraggingRef.current) return
      isUtilityPickingRef.current = true
      setIsUtilityPicking(true)
      setIsExpanded(false)
      setSelectedUtility(null)
    }, LONG_PRESS_DELAY)
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

    if (isUtilityPicking) {
      if (moveDistance < UTILITY_SELECT_DISTANCE) {
        selectedUtilityRef.current = null
        setSelectedUtility(null)
        return
      }

      const utilityOffsets = getLongPressUtilityButtonOffsets(buttonPositionRef.current)
      const pointerVector = { x: event.screenX - pointerStartPos.current.x, y: event.screenY - pointerStartPos.current.y }
      const modeDistance = Math.hypot(pointerVector.x - utilityOffsets.mode.x, pointerVector.y - utilityOffsets.mode.y)
      const configDistance = Math.hypot(pointerVector.x - utilityOffsets.config.x, pointerVector.y - utilityOffsets.config.y)
      const nextUtility = modeDistance <= configDistance ? 'mode' : 'config'
      selectedUtilityRef.current = nextUtility
      setSelectedUtility(nextUtility)
      return
    }

    if (moveDistance >= 5) {
      hasMoved.current = true
      setIsPressed(false)
      clearLongPressTimer()
    }

    setNextDragMotion(getDragMotion(dx, dy))

    const moveSequence = dragMoveSequenceRef.current + 1
    dragMoveSequenceRef.current = moveSequence

    window.electronAPI?.moveFloatingWindow({ x: event.screenX, y: event.screenY })
      .then((nextPosition) => {
        if (!nextPosition || dragMoveSequenceRef.current !== moveSequence) return
        const clampedPosition = clampButtonPosition(nextPosition)
        setButtonPosition(clampedPosition)
        buttonPositionRef.current = clampedPosition
      })
      .catch(() => undefined)
  }

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    finishMainDrag(event.pointerId)
  }

  const handlePointerLeave = () => {
    if (!isDragging) {
      setIsHovering(false)
      setPointerOffset({ x: 0, y: 0 })
    }
  }

  useEffect(() => {
    const handleGlobalPointerEnd = () => {
      finishMainDrag()
    }

    window.addEventListener('pointerup', handleGlobalPointerEnd, true)
    window.addEventListener('mouseup', handleGlobalPointerEnd, true)
    window.addEventListener('blur', handleGlobalPointerEnd)

    return () => {
      window.removeEventListener('pointerup', handleGlobalPointerEnd, true)
      window.removeEventListener('mouseup', handleGlobalPointerEnd, true)
      window.removeEventListener('blur', handleGlobalPointerEnd)
    }
  }, [])

  const dynamicStyle = {
    '--mx': `${pointerOffset.x}px`,
    '--my': `${pointerOffset.y}px`,
    '--tilt-x': `${pointerOffset.y * -0.35}deg`,
    '--tilt-y': `${pointerOffset.x * 0.35}deg`,
    '--accent': launcherMode === 'hotkey' ? '#f59e0b' : '#3370ff',
    '--mode-flash': launcherMode === 'hotkey' ? '#3370ff' : '#f59e0b',
    '--slime-glow-core': launcherMode === 'hotkey' ? 'rgba(245, 158, 11, 0.28)' : 'rgba(45, 212, 191, 0.22)',
    '--slime-glow-edge': launcherMode === 'hotkey' ? 'rgba(34, 197, 94, 0.18)' : 'rgba(51, 112, 255, 0.15)',
    '--drag-angle': `${dragMotion.angle}deg`,
    '--drag-angle-inverse': `${dragMotion.angle * -1}deg`,
    '--drag-scale-x': dragMotion.scaleX,
    '--drag-scale-y': dragMotion.scaleY,
    '--drag-shift-x': `${dragMotion.shiftX}px`,
    '--drag-shift-y': `${dragMotion.shiftY}px`
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
    triggerSlimeFeedback('execute')
    window.electronAPI?.executeShortcut(shortcutId)
  }

  const handleLaunchButtonPointerUp = async (event: PointerEvent<HTMLButtonElement>, shortcutId: string) => {
    event.preventDefault()
    event.stopPropagation()
    triggerSlimeFeedback('execute')
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
      triggerSlimeFeedback('absorb')
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

  const getEdgeLayout = (position: { x: number; y: number }): FloatingEdgeLayout => ({
    isNearLeft: position.x < EDGE_ADAPT_THRESHOLD,
    isNearRight: position.x > window.innerWidth - EDGE_ADAPT_THRESHOLD,
    isNearTop: position.y < EDGE_ADAPT_THRESHOLD,
    isNearBottom: position.y > window.innerHeight - EDGE_ADAPT_THRESHOLD
  })

  const getBurstAngles = (total: number, layout: FloatingEdgeLayout) => {
    const narrow = total <= 3

    if (layout.isNearTop && layout.isNearRight) return narrow ? [110, 160] : [95, 175]
    if (layout.isNearTop && layout.isNearLeft) return narrow ? [20, 70] : [5, 85]
    if (layout.isNearBottom && layout.isNearRight) return narrow ? [-160, -110] : [-175, -95]
    if (layout.isNearBottom && layout.isNearLeft) return narrow ? [-70, -20] : [-85, -5]
    if (layout.isNearRight) return narrow ? [145, 215] : [115, 245]
    if (layout.isNearLeft) return narrow ? [-35, 35] : [-65, 65]
    if (layout.isNearTop) return narrow ? [60, 120] : [25, 155]
    if (layout.isNearBottom) return narrow ? [-120, -60] : [-155, -25]

    return narrow ? [-140, -40] : [-155, 155]
  }

  const getBurstButtonOffset = (
    index: number,
    total: number,
    position = buttonPositionRef.current
  ) => {
    const radius = total <= 3 ? 70 : 78
    const [startAngle, endAngle] = getBurstAngles(total, getEdgeLayout(position))
    const angle = total === 1
      ? (startAngle + endAngle) / 2
      : startAngle + ((endAngle - startAngle) / (total - 1)) * index
    const radians = (angle * Math.PI) / 180

    return {
      x: Math.cos(radians) * radius,
      y: Math.sin(radians) * radius
    }
  }

  const getBurstButtonStyle = (index: number, total: number, accent: string) => {
    const offset = getBurstButtonOffset(index, total, buttonPosition)

    return {
      '--accent': accent,
      '--burst-x': `${offset.x}px`,
      '--burst-y': `${offset.y}px`,
      '--burst-delay': `${index * 18}ms`
    } as CSSProperties
  }

  const getUtilityAngles = (layout: FloatingEdgeLayout) => {
    if (layout.isNearTop && layout.isNearRight) return [105, 165, 135, 90, 180]
    if (layout.isNearTop && layout.isNearLeft) return [75, 15, 45, 90, 0]
    if (layout.isNearBottom && layout.isNearRight) return [-105, -165, -135, -90, 180]
    if (layout.isNearBottom && layout.isNearLeft) return [-15, -75, -45, -90, 0]
    if (layout.isNearRight) return [90, -90, 180, 125, -125]
    if (layout.isNearLeft) return [90, -90, 0, 55, -55]
    if (layout.isNearTop) return [25, 155, 90, 55, 125]
    if (layout.isNearBottom) return [-25, -155, -90, -55, -125]
    return [180, 225, 135, -135, -45, 45, 90, -90]
  }

  const getUtilityCandidates = (
    position: { x: number; y: number },
    layout: FloatingEdgeLayout
  ) => {
    const radii = [128, 146, 164]
    const candidates: Array<{ x: number; y: number }> = []

    radii.forEach((radius) => {
      getUtilityAngles(layout).forEach((angle) => {
        const radians = (angle * Math.PI) / 180
        const candidate = {
          x: Math.cos(radians) * radius,
          y: Math.sin(radians) * radius
        }
        const screenX = position.x + candidate.x
        const screenY = position.y + candidate.y
        const isInsideScreen = screenX >= UTILITY_SCREEN_MARGIN
          && screenX <= window.innerWidth - UTILITY_SCREEN_MARGIN
          && screenY >= UTILITY_SCREEN_MARGIN
          && screenY <= window.innerHeight - UTILITY_SCREEN_MARGIN

        if (!isInsideScreen) return

        const isDuplicate = candidates.some((existing) => (
          Math.hypot(existing.x - candidate.x, existing.y - candidate.y) < 1
        ))

        if (!isDuplicate) {
          candidates.push(candidate)
        }
      })
    })

    return candidates
  }

  const getUtilityButtonOffsets = (
    position = buttonPositionRef.current,
    total = burstShortcutsRef.current.length
  ) => {
    const layout = getEdgeLayout(position)
    const burstOffsets = Array.from({ length: total }, (_item, index) => (
      getBurstButtonOffset(index, total, position)
    ))
    const candidates = getUtilityCandidates(position, layout)
    const selected: Array<{ x: number; y: number }> = []

    const getCandidateClearance = (
      candidate: { x: number; y: number },
      selectedOffsets = selected
    ) => Math.min(
      ...[
        ...burstOffsets.map((offset) => Math.hypot(candidate.x - offset.x, candidate.y - offset.y)),
        ...selectedOffsets.map((offset) => Math.hypot(candidate.x - offset.x, candidate.y - offset.y))
      ],
      Number.POSITIVE_INFINITY
    )

    const isFarEnough = (candidate: { x: number; y: number }) => (
      burstOffsets.every((offset) => (
        Math.hypot(candidate.x - offset.x, candidate.y - offset.y) >= FLOATING_CONTROL_MIN_DISTANCE
      ))
      && selected.every((offset) => (
        Math.hypot(candidate.x - offset.x, candidate.y - offset.y) >= UTILITY_CONTROL_MIN_DISTANCE
      ))
    )

    candidates
      .sort((a, b) => getCandidateClearance(b, []) - getCandidateClearance(a, []))
      .forEach((candidate) => {
      if (selected.length < 2 && isFarEnough(candidate)) {
        selected.push(candidate)
      }
    })

    while (selected.length < 2 && candidates.length > 0) {
      const fallback = candidates
        .filter((candidate) => selected.every((offset) => (
          Math.hypot(candidate.x - offset.x, candidate.y - offset.y) >= UTILITY_CONTROL_MIN_DISTANCE
        )))
        .sort((a, b) => getCandidateClearance(b) - getCandidateClearance(a))[0]

      if (!fallback) break
      selected.push(fallback)
    }

    const [mode = { x: -166, y: 0 }, config = { x: 166, y: 0 }] = selected

    return {
      mode,
      config
    }
  }

  const getLongPressUtilityButtonOffsets = (position = buttonPositionRef.current) => {
    const layout = getEdgeLayout(position)

    if (layout.isNearRight) {
      return {
        mode: { x: -72, y: -42 },
        config: { x: -72, y: 42 }
      }
    }

    if (layout.isNearLeft) {
      return {
        mode: { x: 72, y: -42 },
        config: { x: 72, y: 42 }
      }
    }

    if (layout.isNearTop) {
      return {
        mode: { x: -42, y: 72 },
        config: { x: 42, y: 72 }
      }
    }

    if (layout.isNearBottom) {
      return {
        mode: { x: -42, y: -72 },
        config: { x: 42, y: -72 }
      }
    }

    return {
      mode: { x: -72, y: 0 },
      config: { x: 72, y: 0 }
    }
  }

  useEffect(() => {
    const getDistance = (
      point: { x: number; y: number },
      target: { x: number; y: number }
    ) => Math.hypot(point.x - target.x, point.y - target.y)

    const handleMouseMove = (event: MouseEvent) => {
      const center = buttonPositionRef.current
      const point = { x: event.clientX, y: event.clientY }
      const isOverMainButton = getDistance(point, center) <= MAIN_BUTTON_HIT_RADIUS
      const shouldStayExpanded = isExpandedRef.current
        && getDistance(point, center) <= EXPANDED_KEEPALIVE_RADIUS

      let isOverControl = isOverMainButton

      if (isExpandedRef.current || shouldStayExpanded || isOverMainButton) {
        const utilityOffsets = getUtilityButtonOffsets(center, burstShortcutsRef.current.length)
        const modeCenter = { x: center.x + utilityOffsets.mode.x, y: center.y + utilityOffsets.mode.y }
        const configCenter = { x: center.x + utilityOffsets.config.x, y: center.y + utilityOffsets.config.y }
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
        isExpanded ? 'is-expanded' : '',
        isUtilityPicking ? 'is-utility-picking' : ''
      ].join(' ')}
      onWheel={(event) => {
        event.preventDefault()
        stepShortcut(event.deltaY > 0 ? 1 : -1)
      }}
    >
      <div
        className="floating-control-plane"
        style={{
          '--button-x': `${buttonPosition.x}px`,
          '--button-y': `${buttonPosition.y}px`
        } as CSSProperties}
      >
        <div
          className={[
            'floating-button-container',
            launcherMode === 'hotkey' ? 'is-hotkey-mode' : '',
            isHovering ? 'is-hovering' : '',
            isDragging ? 'is-dragging' : '',
            isUtilityPicking ? 'is-utility-picking' : '',
            slimeFeedback === 'execute' ? 'is-executing' : '',
            slimeFeedback === 'mode' ? 'is-mode-switching' : '',
            slimeFeedback === 'absorb' || absorbedName ? 'is-absorbing' : '',
            isRebounding ? 'is-rebounding' : '',
            isPressed ? 'is-pressed' : '',
          ].join(' ')}
          ref={floatingButtonRef}
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
            <div className="slime-avatar" aria-hidden="true">
              <span className="slime-shine" />
              <span className="slime-eye slime-eye-left" />
              <span className="slime-eye slime-eye-right" />
              <span className="slime-mouth" />
              <span className="slime-mode-badge">
                {launcherMode === 'hotkey' ? '⌘' : '↗'}
              </span>
            </div>
          </div>
        </div>

        <div className="floating-burst-ring" aria-label={launcherMode === 'hotkey' ? '快捷键按钮' : '快捷启动按钮'}>
          {burstShortcuts.map((shortcut, index) => (
            <button
              key={shortcut.id}
              className={[
                'floating-burst-item',
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

        {isUtilityPicking && (
          <>
            <button
              className={`floating-mode-toggle ${launcherMode === 'hotkey' ? 'is-hotkey-mode' : ''}`}
              style={{
                '--utility-x': `${getLongPressUtilityButtonOffsets(buttonPosition).mode.x}px`,
                '--utility-y': `${getLongPressUtilityButtonOffsets(buttonPosition).mode.y}px`
              } as CSSProperties}
              type="button"
              onPointerDown={(event) => {
                event.stopPropagation()
              }}
              onPointerUp={handleModeTogglePointerUp}
              title={launcherMode === 'hotkey' ? '切换到启动模式' : '切换到快捷键模式'}
            >
              <span className={selectedUtility === 'mode' ? 'is-selected' : ''}>
                {launcherMode === 'hotkey' ? '↗' : '⌘'}
              </span>
            </button>

            <button
              className={`floating-config ${launcherMode === 'hotkey' ? 'is-hotkey-mode' : ''}`}
              style={{
                '--utility-x': `${getLongPressUtilityButtonOffsets(buttonPosition).config.x}px`,
                '--utility-y': `${getLongPressUtilityButtonOffsets(buttonPosition).config.y}px`
              } as CSSProperties}
              type="button"
              onPointerDown={(event) => {
                event.stopPropagation()
              }}
              onPointerUp={handleConfigPointerUp}
              title="打开配置面板"
            >
              <span className={selectedUtility === 'config' ? 'is-selected' : ''}>⚙</span>
            </button>
          </>
        )}

        {absorbedName && (
          <div className="floating-absorb-toast">
            {absorbedName.slice(0, 10)}
          </div>
        )}
      </div>
    </div>
  )
}

export default FloatingButton
