import { app, BrowserWindow, shell, Tray, Menu, nativeImage, ipcMain, screen } from 'electron'
import { execFile } from 'child_process'
import * as path from 'path'
import Store from 'electron-store'

const store = new Store()
const FEISHU_MINUTES_HOME_URL = process.env.FEISHU_MINUTES_HOME_URL || 'https://www.feishu.cn/minutes/home'
const gotSingleInstanceLock = app.requestSingleInstanceLock()

let floatingWindow: BrowserWindow | null = null
let tray: Tray | null = null
let dragState: {
  windowStartPosition: [number, number]
  pointerStartPosition: { x: number; y: number }
} | null = null

if (!gotSingleInstanceLock) {
  app.quit()
}

app.on('second-instance', () => {
  if (floatingWindow) {
    floatingWindow.show()
    floatingWindow.focus()
  }
})

// 创建悬浮按钮窗口
function createFloatingWindow() {
  const savedPosition = store.get('windowPosition', { x: -1, y: -1 }) as { x: number; y: number }

  floatingWindow = new BrowserWindow({
    width: 60,
    height: 60,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // 加载悬浮按钮页面
  if (process.env.NODE_ENV === 'development') {
    floatingWindow.loadURL('http://localhost:5173/#/floating')
  } else {
    floatingWindow.loadFile(path.join(__dirname, '../dist/index.html'), {
      hash: '/floating'
    })
  }

  // 设置窗口位置
  if (savedPosition.x !== -1 && savedPosition.y !== -1) {
    floatingWindow.setPosition(savedPosition.x, savedPosition.y)
  } else {
    // 默认位置：屏幕右上角
    const primaryDisplay = screen.getPrimaryDisplay()
    const { x, y, width } = primaryDisplay.workArea
    floatingWindow.setPosition(x + width - 80, y + 20)
  }

  floatingWindow.on('move', () => {
    const [x, y] = floatingWindow!.getPosition()
    store.set('windowPosition', { x, y })
  })

  floatingWindow.on('closed', () => {
    floatingWindow = null
  })
}

// 创建系统托盘
function createTray() {
  // 创建托盘图标（使用简单的SVG图标）
  const iconPath = app.isPackaged
    ? path.join(__dirname, '../dist/icon.svg')
    : path.join(__dirname, '../public/icon.svg')

  const trayIcon = nativeImage.createFromPath(iconPath)

  tray = new Tray(trayIcon)

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '打开飞书妙记并录音',
      click: () => {
        startFeishuRecording()
      }
    },
    {
      label: '显示悬浮按钮',
      click: () => {
        if (floatingWindow) {
          floatingWindow.show()
        } else {
          createFloatingWindow()
        }
      }
    },
    {
      label: '隐藏悬浮按钮',
      click: () => {
        if (floatingWindow) {
          floatingWindow.hide()
        }
      }
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        app.quit()
      }
    }
  ])

  tray.setToolTip('飞书录音纪要')
  tray.setContextMenu(contextMenu)

  // 双击托盘图标打开飞书
  tray.on('double-click', () => {
    startFeishuRecording()
  })
}

// 打开飞书会议纪要页面
async function openFeishuMeeting() {
  const feishuAppLink = `https://applink.feishu.cn/client/web_url/open?mode=appCenter&reload=false&url=${encodeURIComponent(FEISHU_MINUTES_HOME_URL)}`

  if (process.platform === 'darwin') {
    try {
      await openUrlWithMacApp('Lark', FEISHU_MINUTES_HOME_URL)
      return
    } catch (error) {
      console.error('使用 Lark 打开妙记失败:', error)
    }

    try {
      await openUrlWithMacApp('飞书', FEISHU_MINUTES_HOME_URL)
      return
    } catch (error) {
      console.error('使用飞书打开妙记失败:', error)
    }
  }

  await shell.openExternal(feishuAppLink)
}

function openUrlWithMacApp(appName: string, url: string) {
  return new Promise<void>((resolve, reject) => {
    execFile('open', ['-a', appName, url], (error) => {
      if (error) {
        reject(error)
      } else {
        resolve()
      }
    })
  })
}

function clickFeishuRecordButton() {
  if (process.platform !== 'darwin') {
    return
  }

  const script = `
tell application "Lark" to activate
delay 2.5
tell application "System Events"
  set targetProcess to missing value
  repeat with processName in {"飞书", "Lark", "Feishu"}
    if exists process processName then
      set targetProcess to process processName
      exit repeat
    end if
  end repeat

  if targetProcess is missing value then error "找不到飞书/Lark 进程"

  tell targetProcess
    set frontmost to true
    delay 0.3
    set windowPosition to position of front window
    set windowSize to size of front window
    set clickX to (item 1 of windowPosition) + (item 1 of windowSize) - 270
    set clickY to (item 2 of windowPosition) + 145
  end tell

  click at {clickX, clickY}
end tell
`

  execFile('osascript', ['-e', script], (error) => {
    if (error) {
      console.error('自动点击飞书录音按钮失败:', error)
    }
  })
}

async function startFeishuRecording() {
  await openFeishuMeeting()

  clickFeishuRecordButton()
}

// 应用启动
app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    app.dock.hide()
  }

  createFloatingWindow()
  createTray()

  // IPC处理程序
  ipcMain.handle('open-feishu-meeting', async () => {
    await startFeishuRecording()
  })

  ipcMain.handle('minimize-window', async () => {
    if (floatingWindow) {
      floatingWindow.minimize()
    }
  })

  ipcMain.handle('maximize-window', async () => {
    if (floatingWindow) {
      if (floatingWindow.isMaximized()) {
        floatingWindow.unmaximize()
      } else {
        floatingWindow.maximize()
      }
    }
  })

  ipcMain.handle('close-window', async () => {
    if (floatingWindow) {
      floatingWindow.hide()
    }
  })

  ipcMain.on('floating-drag-start', (_event, pointerPosition: { x: number; y: number }) => {
    if (!floatingWindow) return

    dragState = {
      windowStartPosition: floatingWindow.getPosition() as [number, number],
      pointerStartPosition: pointerPosition
    }
  })

  ipcMain.on('floating-drag-move', (_event, pointerPosition: { x: number; y: number }) => {
    if (!floatingWindow || !dragState) return

    const dx = pointerPosition.x - dragState.pointerStartPosition.x
    const dy = pointerPosition.y - dragState.pointerStartPosition.y
    const [startX, startY] = dragState.windowStartPosition

    floatingWindow.setPosition(Math.round(startX + dx), Math.round(startY + dy))
  })

  ipcMain.on('floating-drag-end', () => {
    if (floatingWindow) {
      const [x, y] = floatingWindow.getPosition()
      store.set('windowPosition', { x, y })
    }

    dragState = null
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createFloatingWindow()
    }
  })
})

// 所有窗口关闭时退出（macOS除外）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// 应用退出前清理
app.on('before-quit', () => {
  if (tray) {
    tray.destroy()
  }
})
