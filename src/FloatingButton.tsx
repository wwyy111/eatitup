import { type CSSProperties, useRef, useState } from 'react'

const FloatingButton = () => {
  const [isDragging, setIsDragging] = useState(false)
  const [isHovering, setIsHovering] = useState(false)
  const [isPressed, setIsPressed] = useState(false)
  const [pointerOffset, setPointerOffset] = useState({ x: 0, y: 0 })
  const buttonRef = useRef<HTMLDivElement>(null)
  const pointerStartPos = useRef({ x: 0, y: 0 })
  const hasMoved = useRef(false)

  // 处理打开飞书
  const handleOpenFeishu = async () => {
    if (window.electronAPI) {
      try {
        await window.electronAPI.openFeishuMeeting()
      } catch (error) {
        console.error('打开飞书失败:', error)
        // 如果API调用失败，直接打开浏览器
        window.open('https://www.feishu.cn/meeting/minutes', '_blank')
      }
    } else {
      // 开发环境下直接打开
      window.open('https://www.feishu.cn/meeting/minutes', '_blank')
    }
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return

    e.currentTarget.setPointerCapture(e.pointerId)
    pointerStartPos.current = { x: e.screenX, y: e.screenY }
    hasMoved.current = false
    setIsDragging(true)
    setIsPressed(true)
    window.electronAPI?.startFloatingDrag({ x: e.screenX, y: e.screenY })
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left - rect.width / 2
    const y = e.clientY - rect.top - rect.height / 2
    setPointerOffset({
      x: Math.max(-18, Math.min(18, x)),
      y: Math.max(-18, Math.min(18, y))
    })

    if (!isDragging) return

    const dx = e.screenX - pointerStartPos.current.x
    const dy = e.screenY - pointerStartPos.current.y
    const moveDistance = Math.hypot(dx, dy)

    if (moveDistance >= 5) {
      hasMoved.current = true
    }

    window.electronAPI?.moveFloatingWindow({ x: e.screenX, y: e.screenY })
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return

    e.currentTarget.releasePointerCapture(e.pointerId)
    setIsDragging(false)
    setIsPressed(false)
    window.electronAPI?.endFloatingDrag()

    if (!hasMoved.current) {
      handleOpenFeishu()
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
    '--tilt-y': `${pointerOffset.x * 0.35}deg`
  } as CSSProperties

  return (
    <div className="floating-stage">
      <div
        ref={buttonRef}
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
          <svg
            className="floating-icon"
            width="34"
            height="34"
            viewBox="0 0 34 34"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <rect x="4" y="5" width="20" height="17" rx="4" fill="white" fillOpacity="0.96"/>
            <path d="M9 10.5h10.5M9 15h8" stroke="#3370ff" strokeWidth="2" strokeLinecap="round"/>
            <circle cx="23.5" cy="23.5" r="7.5" fill="#ff4d4f"/>
            <path d="M23.5 19.8v6.4M20.3 23h6.4" stroke="white" strokeWidth="2.1" strokeLinecap="round"/>
          </svg>
          <span className="floating-pulse-dot" />
        </div>
      </div>
    </div>
  )
}

export default FloatingButton
