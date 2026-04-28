import { useRef, useState } from 'react'

const FloatingButton = () => {
  const [isDragging, setIsDragging] = useState(false)
  const [showTooltip, setShowTooltip] = useState(false)
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
    setShowTooltip(false)
    window.electronAPI?.startFloatingDrag({ x: e.screenX, y: e.screenY })
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
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
    window.electronAPI?.endFloatingDrag()

    if (!hasMoved.current) {
      handleOpenFeishu()
    }
  }

  return (
    <div className="w-screen h-screen bg-transparent flex items-center justify-center">
      <div
        ref={buttonRef}
        className="floating-button-container"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onMouseEnter={() => !isDragging && setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        {/* 飞书图标 */}
        <svg
          width="32"
          height="32"
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect width="32" height="32" rx="8" fill="white"/>
          <path
            d="M8 10h16v12H8z"
            fill="#3370ff"
          />
          <path
            d="M10 12h6v2h-6z"
            fill="white"
          />
          <path
            d="M10 16h8v2h-8z"
            fill="white"
          />
          <circle cx="22" cy="22" r="6" fill="#ff4d4f"/>
          <path
            d="M20 22h4"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>

        {/* 工具提示 */}
        {showTooltip && (
          <div
            className="absolute left-full ml-2 px-2 py-1 bg-gray-800 text-white text-xs rounded whitespace-nowrap"
            style={{ top: '50%', transform: 'translateY(-50%)' }}
          >
            点击打开飞书纪要
          </div>
        )}
      </div>
    </div>
  )
}

export default FloatingButton
