import { useState } from 'react'

const MainWindow = () => {
  const [isOpening, setIsOpening] = useState(false)

  const handleOpenFeishu = async () => {
    if (isOpening) return

    setIsOpening(true)

    if (window.electronAPI) {
      try {
        await window.electronAPI.openFeishuMeeting()
      } catch (error) {
        console.error('打开飞书失败:', error)
        window.open('https://www.feishu.cn/meeting/minutes', '_blank')
      }
    } else {
      window.open('https://www.feishu.cn/meeting/minutes', '_blank')
    }

    setTimeout(() => setIsOpening(false), 2000)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* 主卡片 */}
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
          {/* 应用图标 */}
          <div className="mx-auto mb-6 w-20 h-20 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg">
            <svg
              width="40"
              height="40"
              viewBox="0 0 40 40"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <rect width="40" height="40" rx="10" fill="white"/>
              <path d="M10 12.5h20v15H10z" fill="#3370ff"/>
              <path d="M12.5 15h7.5v2.5h-7.5z" fill="white"/>
              <path d="M12.5 20h10v2.5h-10z" fill="white"/>
              <circle cx="27.5" cy="27.5" r="7.5" fill="#ff4d4f"/>
              <path d="M25 27.5h5" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
          </div>

          {/* 标题 */}
          <h1 className="text-2xl font-bold text-gray-800 mb-2">
            飞书录音纪要
          </h1>
          <p className="text-gray-600 mb-8">
            快速访问飞书会议纪要，开启高效录音记录
          </p>

          {/* 主要按钮 */}
          <button
            onClick={handleOpenFeishu}
            disabled={isOpening}
            className={`w-full py-4 px-6 bg-gradient-to-r from-blue-500 to-blue-600 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none ${
              isOpening ? 'animate-pulse' : ''
            }`}
          >
            {isOpening ? '正在打开...' : '打开飞书纪要'}
          </button>

          {/* 快捷提示 */}
          <div className="mt-8 pt-6 border-t border-gray-200">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">快捷提示</h3>
            <div className="space-y-2 text-left text-sm text-gray-600">
              <div className="flex items-start">
                <span className="text-blue-500 mr-2">•</span>
                <span>点击悬浮按钮快速打开飞书会议纪要</span>
              </div>
              <div className="flex items-start">
                <span className="text-blue-500 mr-2">•</span>
                <span>拖拽按钮调整屏幕位置</span>
              </div>
              <div className="flex items-start">
                <span className="text-blue-500 mr-2">•</span>
                <span>使用飞书内置录音功能记录会议</span>
              </div>
              <div className="flex items-start">
                <span className="text-blue-500 mr-2">•</span>
                <span>右键托盘图标访问更多选项</span>
              </div>
            </div>
          </div>
        </div>

        {/* 版权信息 */}
        <div className="text-center mt-6 text-sm text-gray-500">
          <p>© 2024 飞书录音纪要助手</p>
        </div>
      </div>
    </div>
  )
}

export default MainWindow
