import { app, BrowserWindow, shell, Tray, Menu, nativeImage, ipcMain, screen, systemPreferences, dialog, globalShortcut } from 'electron'
import { execFile, spawn, type ChildProcess } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import Store from 'electron-store'
import { DEFAULT_SHORTCUTS, type LauncherMode, type Shortcut } from '../src/shortcuts'

type CapturedWindowInfo = {
  appName: string
  bundleId: string
  title: string
  url: string
  x: number
  y: number
  width: number
  height: number
}

const store = new Store()
const FEISHU_MINUTES_HOME_URL = process.env.FEISHU_MINUTES_HOME_URL || 'https://www.feishu.cn/minutes/home'
const gotSingleInstanceLock = app.requestSingleInstanceLock()
const APP_NAME = '浮点启动台'
const SELF_PROCESS_IDS = new Set([process.pid])
const FLOATING_BUTTON_SIZE = 64
const LEGACY_FLOATING_WINDOW_WIDTH = 286
const LEGACY_FLOATING_WINDOW_HEIGHT = 220
const ABSORB_TARGET_RADIUS = 74
const ABSORB_MIN_DRAG_DISTANCE = 80
const SELF_BUNDLE_IDS = new Set(['com.github.Electron', 'com.float.launcher', 'local.float-launcher.launcher'])
const GLOBAL_SHORTCUTS_TO_SWALLOW_DURING_RECORDING = [
  { accelerator: 'CommandOrControl+Shift+3', target: 'Command+Shift+3' },
  { accelerator: 'CommandOrControl+Shift+4', target: 'Command+Shift+4' },
  { accelerator: 'CommandOrControl+Shift+5', target: 'Command+Shift+5' },
  { accelerator: 'CommandOrControl+Space', target: 'Command+Space' },
  { accelerator: 'Control+CommandOrControl+Space', target: 'Control+Command+Space' }
]
const RECORDING_MODIFIER_KEYS = new Set(['Meta', 'OS', 'Super', 'Command', 'Cmd', 'Shift', 'Alt', 'Control', 'Fn', 'fn'])

let floatingWindow: BrowserWindow | null = null
let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let frontmostTrackingTimer: NodeJS.Timeout | null = null
let lastExternalApp: { name: string; processId: number } | null = null
let isRecordingHotkey = false
let hotkeyRecorderProcess: ChildProcess | null = null
let hotkeyRecorderBuffer = ''
let windowDropMonitorProcess: ChildProcess | null = null
let windowDropMonitorBuffer = ''
let floatingWindowIsPassthrough = false
let suppressMainWindowActivationUntil = 0
let windowDropCandidate: {
  startPosition: { x: number; y: number }
  maxDistance: number
  snapshotPromise: Promise<CapturedWindowInfo | null> | null
} | null = null

if (!gotSingleInstanceLock) {
  app.quit()
}

app.on('second-instance', () => {
  showMainWindow()

  if (floatingWindow) {
    floatingWindow.show()
  }
})

function createFloatingWindow() {
  const buttonPosition = getStoredFloatingButtonPosition()
  const display = screen.getDisplayNearestPoint(buttonPosition)
  const bounds = getFloatingOverlayBounds(display.bounds)
  const clampedButtonPosition = clampFloatingButtonScreenPosition(buttonPosition, bounds)

  floatingWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    alwaysOnTop: true,
    type: 'panel',
    resizable: false,
    movable: false,
    focusable: false,
    fullscreenable: false,
    enableLargerThanScreen: true,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  floatingWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  floatingWindow.setAlwaysOnTop(true, 'screen-saver')
  floatingWindow.setBounds(bounds)

  // 加载悬浮按钮页面
  if (process.env.NODE_ENV === 'development') {
    floatingWindow.loadURL('http://localhost:5173/#/floating')
  } else {
    floatingWindow.loadFile(path.join(__dirname, '../dist/index.html'), {
      hash: '/floating'
    })
  }

  store.set('floatingButtonPosition', clampedButtonPosition)
  store.set('windowPosition', { x: bounds.x, y: bounds.y })
  store.set('windowSize', { width: bounds.width, height: bounds.height })
  setFloatingMousePassthrough(true)

  floatingWindow.on('closed', () => {
    floatingWindow = null
    floatingWindowIsPassthrough = false
  })
}

function getStoredFloatingButtonPosition() {
  const storedButtonPosition = store.get('floatingButtonPosition') as { x?: unknown; y?: unknown } | undefined
  if (
    storedButtonPosition
    && Number.isFinite(storedButtonPosition.x)
    && Number.isFinite(storedButtonPosition.y)
  ) {
    return {
      x: Number(storedButtonPosition.x),
      y: Number(storedButtonPosition.y)
    }
  }

  const savedPosition = store.get('windowPosition', { x: -1, y: -1 }) as { x: number; y: number }
  const savedWindowSize = store.get('windowSize', {
    width: LEGACY_FLOATING_WINDOW_WIDTH,
    height: LEGACY_FLOATING_WINDOW_HEIGHT
  }) as { width: number; height: number }

  if (savedPosition.x !== -1 && savedPosition.y !== -1) {
    return {
      x: savedPosition.x + savedWindowSize.width / 2,
      y: savedPosition.y + savedWindowSize.height / 2
    }
  }

  const primaryDisplay = screen.getPrimaryDisplay()
  const { x, y, width } = primaryDisplay.bounds
  return {
    x: x + width - 120,
    y: y + 120
  }
}

function clampFloatingButtonScreenPosition(
  position: { x: number; y: number },
  bounds = floatingWindow?.getBounds() ?? screen.getDisplayNearestPoint(position).bounds
) {
  const margin = FLOATING_BUTTON_SIZE / 2
  return {
    x: Math.max(bounds.x + margin, Math.min(bounds.x + bounds.width - margin, position.x)),
    y: Math.max(bounds.y + margin, Math.min(bounds.y + bounds.height - margin, position.y))
  }
}

function getFloatingOverlayBounds(bounds: { x: number; y: number; width: number; height: number }) {
  if (process.platform === 'darwin' && bounds.x === 0 && bounds.y > 0) {
    return {
      ...bounds,
      y: 0
    }
  }

  return bounds
}

function getFloatingButtonLocalPosition() {
  const bounds = floatingWindow?.getBounds() ?? screen.getPrimaryDisplay().bounds
  const position = clampFloatingButtonScreenPosition(getStoredFloatingButtonPosition(), bounds)
  store.set('floatingButtonPosition', position)

  return {
    x: position.x - bounds.x,
    y: position.y - bounds.y
  }
}

function saveFloatingButtonLocalPosition(position: { x: number; y: number }) {
  if (!floatingWindow) {
    return getStoredFloatingButtonPosition()
  }

  const bounds = floatingWindow.getBounds()
  const nextPosition = clampFloatingButtonScreenPosition({
    x: bounds.x + position.x,
    y: bounds.y + position.y
  }, bounds)

  store.set('floatingButtonPosition', nextPosition)
  return nextPosition
}

function setFloatingMousePassthrough(isPassthrough: boolean) {
  if (!floatingWindow || floatingWindowIsPassthrough === isPassthrough) {
    return
  }

  floatingWindowIsPassthrough = isPassthrough
  floatingWindow.setIgnoreMouseEvents(isPassthrough, { forward: true })
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1060,
    height: 720,
    minWidth: 900,
    minHeight: 620,
    title: APP_NAME,
    backgroundColor: '#f6f7fb',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173/')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
    setHotkeyRecording(false)
  })

  mainWindow.on('blur', () => {
    setHotkeyRecording(false)
  })

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (isRecordingHotkey) {
      if (input.type === 'keyDown' && !input.isAutoRepeat) {
        const hotkey = createRecordedHotkeyFromInput(input)
        if (hotkey) {
          mainWindow?.webContents.send('hotkey-recording:captured', hotkey)
        }
      }

      event.preventDefault()
    }
  })
}

function showMainWindow() {
  if (!mainWindow) {
    createMainWindow()
    return
  }

  mainWindow.show()
  mainWindow.focus()
}

function isCursorInsideFloatingWindow() {
  if (!floatingWindow) {
    return false
  }

  const cursorPosition = screen.getCursorScreenPoint()
  return isPointInsideFloatingWindow(cursorPosition)
}

function isPointInsideFloatingWindow(point: { x: number; y: number }) {
  if (!floatingWindow) {
    return false
  }

  const floatingBounds = floatingWindow.getBounds()
  return point.x >= floatingBounds.x
    && point.x <= floatingBounds.x + floatingBounds.width
    && point.y >= floatingBounds.y
    && point.y <= floatingBounds.y + floatingBounds.height
}

function getFloatingWindowCenter() {
  return getStoredFloatingButtonPosition()
}

function isPointInFloatingAbsorbZone(point: { x: number; y: number }) {
  const center = getFloatingWindowCenter()
  if (!center) {
    return false
  }

  return Math.hypot(point.x - center.x, point.y - center.y) <= ABSORB_TARGET_RADIUS
}

function showMainWindowFromActivation() {
  setTimeout(() => {
    if (Date.now() < suppressMainWindowActivationUntil) {
      return
    }

    if (isCursorInsideFloatingWindow()) {
      return
    }

    showMainWindow()
  }, 120)
}

function suppressMainWindowActivation(durationMs = 800) {
  suppressMainWindowActivationUntil = Date.now() + durationMs
}

function normalizeRecordedInputKey(key: string) {
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

  if (keyMap[key] !== undefined) return keyMap[key]
  if (key.length === 1) return key.toUpperCase()
  return key
}

function createRecordedHotkeyFromInput(input: {
  key: string
  meta: boolean
  control: boolean
  alt: boolean
  shift: boolean
}) {
  if (!input.key || RECORDING_MODIFIER_KEYS.has(input.key)) {
    return ''
  }

  const normalizedKey = normalizeRecordedInputKey(input.key)
  if (!normalizedKey) {
    return ''
  }

  return [
    input.meta ? 'Command' : '',
    input.control ? 'Control' : '',
    input.alt ? 'Option' : '',
    input.shift ? 'Shift' : '',
    normalizedKey
  ].filter(Boolean).join('+')
}

function setHotkeyRecording(isRecording: boolean) {
  isRecordingHotkey = isRecording

  if (!isRecording) {
    stopHotkeyRecorderHelper()
    for (const shortcut of GLOBAL_SHORTCUTS_TO_SWALLOW_DURING_RECORDING) {
      globalShortcut.unregister(shortcut.accelerator)
    }
    return
  }

  startHotkeyRecorderHelper()

  for (const shortcut of GLOBAL_SHORTCUTS_TO_SWALLOW_DURING_RECORDING) {
    if (!globalShortcut.isRegistered(shortcut.accelerator)) {
      globalShortcut.register(shortcut.accelerator, () => {
        mainWindow?.webContents.send('hotkey-recording:captured', shortcut.target)
      })
    }
  }
}

function getBundledHelperPath(fileName: string) {
  if (process.platform !== 'darwin') {
    return null
  }

  const helperPath = app.isPackaged
    ? path.join(process.resourcesPath, fileName)
    : path.join(__dirname, fileName)

  if (!fs.existsSync(helperPath)) {
    console.warn(`${fileName} helper not found. Run npm run build to compile it.`)
    return null
  }

  return helperPath
}

function getHotkeyRecorderHelperPath() {
  return getBundledHelperPath('HotkeyRecorder')
}

function startHotkeyRecorderHelper() {
  if (hotkeyRecorderProcess || process.platform !== 'darwin') {
    return
  }

  const helperPath = getHotkeyRecorderHelperPath()
  if (!helperPath) {
    return
  }

  hotkeyRecorderBuffer = ''
  const recorderProcess = spawn(helperPath, [], {
    stdio: ['ignore', 'pipe', 'pipe']
  })
  hotkeyRecorderProcess = recorderProcess

  recorderProcess.stdout?.on('data', (chunk: Buffer) => {
    hotkeyRecorderBuffer += chunk.toString('utf8')
    const lines = hotkeyRecorderBuffer.split(/\r?\n/)
    hotkeyRecorderBuffer = lines.pop() || ''

    for (const line of lines) {
      const hotkey = line.trim()
      if (hotkey && !hotkey.startsWith('ERROR:')) {
        mainWindow?.webContents.send('hotkey-recording:captured', hotkey)
      }
    }
  })

  recorderProcess.stderr?.on('data', (chunk: Buffer) => {
    const message = chunk.toString('utf8').trim()
    if (message) {
      console.warn(`Hotkey recorder helper: ${message}`)
    }
  })

  recorderProcess.on('exit', () => {
    if (hotkeyRecorderProcess === recorderProcess) {
      hotkeyRecorderProcess = null
      hotkeyRecorderBuffer = ''
    }
  })
}

function stopHotkeyRecorderHelper() {
  if (!hotkeyRecorderProcess) {
    return
  }

  const processToStop = hotkeyRecorderProcess
  hotkeyRecorderProcess = null
  hotkeyRecorderBuffer = ''
  processToStop.kill()
}

function startWindowDropMonitor() {
  if (windowDropMonitorProcess || process.platform !== 'darwin') {
    return
  }

  const helperPath = getBundledHelperPath('WindowDropMonitor')
  if (!helperPath) {
    return
  }

  windowDropMonitorBuffer = ''
  const monitorProcess = spawn(helperPath, [], {
    stdio: ['ignore', 'pipe', 'pipe']
  })
  windowDropMonitorProcess = monitorProcess

  monitorProcess.stdout?.on('data', (chunk: Buffer) => {
    windowDropMonitorBuffer += chunk.toString('utf8')
    const lines = windowDropMonitorBuffer.split(/\r?\n/)
    windowDropMonitorBuffer = lines.pop() || ''

    for (const line of lines) {
      handleWindowDropMonitorLine(line.trim())
    }
  })

  monitorProcess.stderr?.on('data', (chunk: Buffer) => {
    const message = chunk.toString('utf8').trim()
    if (message) {
      console.warn(`Window drop monitor: ${message}`)
    }
  })

  monitorProcess.on('exit', () => {
    if (windowDropMonitorProcess === monitorProcess) {
      windowDropMonitorProcess = null
      windowDropMonitorBuffer = ''
      windowDropCandidate = null
    }
  })
}

function stopWindowDropMonitor() {
  if (!windowDropMonitorProcess) {
    return
  }

  const processToStop = windowDropMonitorProcess
  windowDropMonitorProcess = null
  windowDropMonitorBuffer = ''
  windowDropCandidate = null
  processToStop.kill()
}

function handleWindowDropMonitorLine(line: string) {
  const [eventType, rawX, rawY] = line.split(' ')
  const x = Number(rawX)
  const y = Number(rawY)

  if (!eventType || !Number.isFinite(x) || !Number.isFinite(y)) {
    return
  }

  if (eventType === 'down') {
    if (isPointInFloatingAbsorbZone({ x, y })) {
      windowDropCandidate = null
      return
    }

    windowDropCandidate = {
      startPosition: { x, y },
      maxDistance: 0,
      snapshotPromise: null
    }
    return
  }

  if (!windowDropCandidate) {
    return
  }

  const distance = Math.hypot(x - windowDropCandidate.startPosition.x, y - windowDropCandidate.startPosition.y)
  windowDropCandidate.maxDistance = Math.max(windowDropCandidate.maxDistance, distance)

  if (eventType === 'drag' && distance >= 12 && !windowDropCandidate.snapshotPromise) {
    windowDropCandidate.snapshotPromise = captureFrontmostWindowInfo()
  }

  if (eventType === 'up') {
    const candidate = windowDropCandidate
    windowDropCandidate = null

    if (candidate.maxDistance < ABSORB_MIN_DRAG_DISTANCE || !isPointInFloatingAbsorbZone({ x, y })) {
      return
    }

    handleExternalWindowAbsorb(candidate.snapshotPromise).catch((error) => {
      console.error('吸收窗口失败:', error)
    })
  }
}

function getAssetPath(fileName: string) {
  return app.isPackaged
    ? path.join(__dirname, '../dist', fileName)
    : path.join(__dirname, '../public', fileName)
}

function createTray() {
  const iconPath = getAssetPath('app-icon.png')
  const trayIcon = nativeImage.createFromPath(iconPath)

  tray = new Tray(trayIcon)

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '执行当前快捷项',
      click: () => {
        executeShortcut()
      }
    },
    {
      label: '打开配置面板',
      click: () => {
        showMainWindow()
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

  tray.setToolTip(APP_NAME)
  tray.setContextMenu(contextMenu)

  tray.on('double-click', () => {
    executeShortcut()
  })
}

// 打开飞书会议纪要页面
async function openFeishuMeeting() {
  const feishuAppLink = `https://applink.feishu.cn/client/web_url/open?mode=appCenter&reload=false&url=${encodeURIComponent(FEISHU_MINUTES_HOME_URL)}`

  if (process.platform === 'darwin') {
    try {
      await openUrlWithMacApp('Lark', feishuAppLink)
      return
    } catch (error) {
      console.error('使用 Lark 打开妙记失败:', error)
    }

    try {
      await openUrlWithMacApp('飞书', feishuAppLink)
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

function openMacApp(appName: string) {
  return new Promise<void>((resolve, reject) => {
    execFile('open', ['-a', appName], (error) => {
      if (error) {
        reject(error)
      } else {
        resolve()
      }
    })
  })
}

function escapeAppleScriptText(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function runAppleScript(script: string) {
  return new Promise<string>((resolve, reject) => {
    execFile('osascript', ['-e', script], (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message))
        return
      }

      resolve(stdout.trim())
    })
  })
}

function createShortcutId(name: string) {
  const cleanName = name.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
  return `${cleanName || 'shortcut'}-${Date.now().toString(36)}`
}

function getShortcutSymbol(info: CapturedWindowInfo) {
  const source = `${info.title} ${info.appName} ${info.url}`.toLowerCase()

  if (source.includes('feishu') || source.includes('lark') || source.includes('飞书')) return 'doc'
  if (source.includes('chatgpt') || source.includes('openai')) return 'spark'
  if (source.includes('xiaohongshu') || source.includes('小红书')) return 'link'
  if (info.url) return 'link'
  return 'app'
}

function getShortcutAccent(info: CapturedWindowInfo) {
  const source = `${info.appName} ${info.url}`.toLowerCase()

  if (source.includes('chrome')) return '#22c55e'
  if (source.includes('safari')) return '#3370ff'
  if (source.includes('xiaohongshu')) return '#7c3aed'
  if (source.includes('chatgpt') || source.includes('openai')) return '#0f766e'
  return '#3370ff'
}

function parseCapturedWindowInfo(output: string): CapturedWindowInfo | null {
  const parts = output.split('\n---FLOAT-LAUNCHER---\n')
  if (parts.length < 8) {
    return null
  }

  const [appName, bundleId, title, url, rawX, rawY, rawWidth, rawHeight] = parts
  const x = Number(rawX)
  const y = Number(rawY)
  const width = Number(rawWidth)
  const height = Number(rawHeight)

  if (!appName || SELF_BUNDLE_IDS.has(bundleId) || appName === 'Electron' || appName === APP_NAME) {
    return null
  }

  return {
    appName,
    bundleId,
    title,
    url,
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
    width: Number.isFinite(width) ? width : 0,
    height: Number.isFinite(height) ? height : 0
  }
}

function createCaptureFrontmostWindowScript() {
  return `
set delimiterText to "---FLOAT-LAUNCHER---"
set frontAppName to ""
set frontBundleId to ""
set windowTitle to ""
set urlValue to ""
set windowX to 0
set windowY to 0
set windowWidth to 0
set windowHeight to 0

tell application "System Events"
  set frontProcess to first application process whose frontmost is true
  set frontAppName to name of frontProcess
  set frontBundleId to bundle identifier of frontProcess
  if exists front window of frontProcess then
    set windowTitle to name of front window of frontProcess
    set windowPosition to position of front window of frontProcess
    set windowSize to size of front window of frontProcess
    set windowX to item 1 of windowPosition
    set windowY to item 2 of windowPosition
    set windowWidth to item 1 of windowSize
    set windowHeight to item 2 of windowSize
  end if
end tell

if frontAppName is "Google Chrome" then
  tell application "Google Chrome"
    if (count of windows) > 0 then
      set windowTitle to title of active tab of front window
      set urlValue to URL of active tab of front window
    end if
  end tell
else if frontAppName is "Safari" or frontAppName is "Safari浏览器" then
  tell application "Safari"
    if (count of windows) > 0 then
      set windowTitle to name of front document
      set urlValue to URL of front document
    end if
  end tell
end if

return frontAppName & linefeed & delimiterText & linefeed & frontBundleId & linefeed & delimiterText & linefeed & windowTitle & linefeed & delimiterText & linefeed & urlValue & linefeed & delimiterText & linefeed & (windowX as text) & linefeed & delimiterText & linefeed & (windowY as text) & linefeed & delimiterText & linefeed & (windowWidth as text) & linefeed & delimiterText & linefeed & (windowHeight as text)
`
}

async function captureFrontmostWindowInfo() {
  if (process.platform !== 'darwin') {
    return null
  }

  try {
    const output = await runAppleScript(createCaptureFrontmostWindowScript())
    return parseCapturedWindowInfo(output)
  } catch (error) {
    console.warn('读取前台窗口失败:', error)
    return null
  }
}

function createRestoreWindowScript(info: CapturedWindowInfo) {
  const appName = escapeAppleScriptText(info.appName)
  const center = getFloatingWindowCenter()
  const targetX = Math.round((center?.x ?? info.x) - 110)
  const targetY = Math.round((center?.y ?? info.y) - 80)

  return `
tell application "System Events"
  if exists application process "${appName}" then
    tell application process "${appName}"
      if exists front window then
        set originalPosition to {${Math.round(info.x)}, ${Math.round(info.y)}}
        set originalSize to {${Math.round(info.width)}, ${Math.round(info.height)}}
        set position of front window to {${targetX}, ${targetY}}
        set size of front window to {220, 160}
        delay 0.16
        set position of front window to originalPosition
        set size of front window to originalSize
      end if
    end tell
  end if
end tell
`
}

async function animateWindowAbsorption(info: CapturedWindowInfo) {
  if (!info.width || !info.height) {
    return
  }

  try {
    await runAppleScript(createRestoreWindowScript(info))
  } catch (error) {
    console.warn('窗口吸收动画失败:', error)
  }
}

async function handleExternalWindowAbsorb(snapshotPromise: Promise<CapturedWindowInfo | null> | null) {
  const info = await (snapshotPromise ?? captureFrontmostWindowInfo())
  if (!info) {
    return
  }

  await animateWindowAbsorption(info)
  const shortcuts = getShortcuts()
  const target = info.url || info.appName
  const existingShortcut = shortcuts.find((shortcut) => shortcut.target === target)

  if (existingShortcut) {
    const nextShortcuts = shortcuts.map((shortcut) => (
      shortcut.id === existingShortcut.id ? { ...shortcut, enabled: true } : shortcut
    ))
    saveShortcuts(nextShortcuts)
    store.set('activeShortcutId', existingShortcut.id)
    floatingWindow?.webContents.send('shortcuts:absorbed', existingShortcut.name)
    return
  }

  const name = (info.title || info.appName).trim()
  const nextShortcut: Shortcut = {
    id: createShortcutId(name),
    name,
    kind: info.url ? 'url' : 'app',
    target,
    accent: getShortcutAccent(info),
    symbol: getShortcutSymbol(info),
    enabled: true
  }

  const nextShortcuts = [...shortcuts, nextShortcut]
  saveShortcuts(nextShortcuts)
  store.set('activeShortcutId', nextShortcut.id)
  floatingWindow?.webContents.send('shortcuts:absorbed', nextShortcut.name)
}

function createHotkeyScript(hotkey: string, targetApp?: { name: string; processId: number } | null) {
  const parts = hotkey
    .split('+')
    .map((part) => part.trim())
    .filter((part) => part && !['fn', 'function'].includes(part.toLowerCase()))

  const key = parts.pop()
  if (!key) {
    throw new Error('快捷键不能为空')
  }

  const modifierMap: Record<string, string> = {
    command: 'command',
    cmd: 'command',
    '⌘': 'command',
    shift: 'shift',
    '⇧': 'shift',
    option: 'option',
    opt: 'option',
    alt: 'option',
    '⌥': 'option',
    control: 'control',
    ctrl: 'control',
    '⌃': 'control'
  }

  const keyCodeMap: Record<string, number> = {
    a: 0,
    s: 1,
    d: 2,
    f: 3,
    h: 4,
    g: 5,
    z: 6,
    x: 7,
    c: 8,
    v: 9,
    b: 11,
    q: 12,
    w: 13,
    e: 14,
    r: 15,
    y: 16,
    t: 17,
    '1': 18,
    '2': 19,
    '3': 20,
    '4': 21,
    '5': 23,
    '6': 22,
    '=': 24,
    plus: 24,
    '+': 24,
    '9': 25,
    '7': 26,
    '-': 27,
    minus: 27,
    '8': 28,
    '0': 29,
    ']': 30,
    o: 31,
    u: 32,
    '[': 33,
    i: 34,
    p: 35,
    return: 36,
    enter: 36,
    l: 37,
    j: 38,
    "'": 39,
    quote: 39,
    k: 40,
    ';': 41,
    semicolon: 41,
    '\\': 42,
    backslash: 42,
    ',': 43,
    comma: 43,
    '/': 44,
    slash: 44,
    n: 45,
    m: 46,
    '.': 47,
    period: 47,
    tab: 48,
    space: 49,
    '`': 50,
    backquote: 50,
    grave: 50,
    delete: 51,
    backspace: 51,
    escape: 53,
    esc: 53,
    f1: 122,
    f2: 120,
    f3: 99,
    f4: 118,
    f5: 96,
    f6: 97,
    f7: 98,
    f8: 100,
    f9: 101,
    f10: 109,
    f11: 103,
    f12: 111,
    home: 115,
    pageup: 116,
    forwarddelete: 117,
    end: 119,
    pagedown: 121,
    left: 123,
    right: 124,
    down: 125,
    up: 126
  }

  const modifiers = parts
    .map((part) => modifierMap[part.toLowerCase()])
    .filter(Boolean)

  const usingClause = modifiers.length > 0 ? ` using {${modifiers.map((modifier) => `${modifier} down`).join(', ')}}` : ''
  const normalizedKey = key.toLowerCase()
  const targetPrelude = targetApp
    ? `set targetProcesses to application processes whose unix id is ${targetApp.processId}
  if (count of targetProcesses) > 0 then
    set frontmost of item 1 of targetProcesses to true
    delay 0.08
  end if
  `
    : ''
  const keyCode = keyCodeMap[normalizedKey]
  const modifierDownCommands = modifiers.map((modifier) => `key down ${modifier}`)
  const modifierUpCommands = [...modifiers].reverse().map((modifier) => `key up ${modifier}`)
  const keyCommand = keyCode !== undefined
    ? `try
    ${modifierDownCommands.join('\n    ')}
    delay 0.03
    key code ${keyCode}
    delay 0.03
    ${modifierUpCommands.join('\n    ')}
  on error errMsg
    ${modifierUpCommands.join('\n    ')}
    error errMsg
  end try`
    : `keystroke "${escapeAppleScriptText(key.length === 1 ? key.toLowerCase() : key)}"${usingClause}`

  return `tell application "System Events"
  ${targetPrelude}${keyCommand}
end tell`
}

async function sendHotkey(hotkey: string) {
  if (process.platform !== 'darwin') {
    return
  }

  if (!ensureAccessibilityPermission()) {
    return
  }

  await rememberFrontmostAppNow()

  return new Promise<void>((resolve, reject) => {
    const targetApp = lastExternalApp
    console.log(`发送快捷键: ${hotkey}${targetApp ? ` -> ${targetApp.name} (${targetApp.processId})` : ''}`)

    execFile('osascript', ['-e', createHotkeyScript(hotkey, targetApp)], (error) => {
      if (error) {
        console.error('发送快捷键失败:', error)
        reject(error)
      } else {
        resolve()
      }
    })
  })
}

function updateLastExternalAppFromOutput(stdout: string) {
  const [appName, rawProcessId] = stdout.trim().split(/\r?\n/).map((part) => part.trim())
  const processId = Number(rawProcessId)
  if (appName && Number.isFinite(processId) && !SELF_PROCESS_IDS.has(processId)) {
    lastExternalApp = { name: appName, processId }
  }
}

function createFrontmostAppScript() {
  return `tell application "System Events"
  set frontApp to first application process whose frontmost is true
  return (name of frontApp) & linefeed & ((unix id of frontApp) as text)
end tell`
}

function rememberFrontmostAppNow() {
  if (process.platform !== 'darwin') {
    return Promise.resolve()
  }

  return new Promise<void>((resolve) => {
    execFile('osascript', ['-e', createFrontmostAppScript()], (error, stdout) => {
      if (!error) {
        updateLastExternalAppFromOutput(stdout)
      }
      resolve()
    })
  })
}

function rememberFrontmostApp() {
  void rememberFrontmostAppNow()
}

function startFrontmostTracking() {
  if (process.platform !== 'darwin' || frontmostTrackingTimer) {
    return
  }

  rememberFrontmostApp()
  frontmostTrackingTimer = setInterval(rememberFrontmostApp, 300)
  frontmostTrackingTimer.unref()
}

function ensureAccessibilityPermission() {
  if (process.platform !== 'darwin') {
    return true
  }

  const hasPermission = systemPreferences.isTrustedAccessibilityClient(false)
  if (hasPermission) {
    return true
  }

  systemPreferences.isTrustedAccessibilityClient(true)
  dialog.showMessageBox({
    type: 'warning',
    title: '需要辅助功能权限',
    message: '需要给“浮点启动台/Electron”开启辅助功能权限，才能自动点击桌面应用里的按钮。',
    detail: '打开后请在“系统设置 > 隐私与安全性 > 辅助功能”里勾选这个应用，然后退出并重新打开浮点启动台。'
  })

  return false
}

function clickFeishuRecordButton() {
  if (process.platform !== 'darwin') {
    return
  }

  const script = `
on clickRecordByCoordinate(targetProcess)
  tell application "System Events"
    tell targetProcess
      set windowPosition to position of front window
      set windowSize to size of front window
    end tell

    set clickX to (item 1 of windowPosition) + (item 1 of windowSize) - 270
    set clickY to (item 2 of windowPosition) + 145
    click at {clickX, clickY}
  end tell
end clickRecordByCoordinate

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
  end tell

  delay 0.8

  my clickRecordByCoordinate(targetProcess)
end tell
`

  execFile('osascript', ['-e', script], (error) => {
    if (error) {
      console.error('自动点击飞书录音按钮失败:', error)
    }
  })
}

async function startFeishuRecording() {
  if (!ensureAccessibilityPermission()) {
    return
  }

  await openFeishuMeeting()

  await new Promise((resolve) => setTimeout(resolve, 3500))

  clickFeishuRecordButton()
}

function normalizeHotkeyTarget(name: string, target: string) {
  const normalizedTarget = target.trim()
  const lowerName = name.toLowerCase()
  const lowerTarget = normalizedTarget.toLowerCase()

  if (lowerTarget === 'fn+c' && (name.includes('复制') || lowerName.includes('copy'))) {
    return 'Command+C'
  }

  if (lowerTarget === 'fn+v' && (name.includes('粘贴') || lowerName.includes('paste'))) {
    return 'Command+V'
  }

  return normalizedTarget
}

function normalizeShortcuts(value: unknown): Shortcut[] {
  if (!Array.isArray(value)) {
    return DEFAULT_SHORTCUTS
  }

  const shortcuts = value
    .filter((item): item is Shortcut => {
      if (!item || typeof item !== 'object') return false
      const maybeShortcut = item as Partial<Shortcut>
      return Boolean(maybeShortcut.id && maybeShortcut.name && maybeShortcut.kind)
    })
    .map((shortcut) => {
      const name = String(shortcut.name)
      const kind = shortcut.kind
      const target = String(shortcut.target ?? '')

      return {
        id: String(shortcut.id),
        name,
        kind,
        target: kind === 'hotkey' ? normalizeHotkeyTarget(name, target) : target,
        accent: String(shortcut.accent || '#3370ff'),
        symbol: String(shortcut.symbol || 'bolt'),
        enabled: shortcut.enabled !== false
      }
    })
    .filter((shortcut) => ['feishu-record', 'url', 'app', 'hotkey'].includes(shortcut.kind))

  return shortcuts
}

function getShortcuts() {
  const shortcuts = normalizeShortcuts(store.get('shortcuts'))
  const storedShortcuts = store.get('shortcuts')
  if (JSON.stringify(storedShortcuts) !== JSON.stringify(shortcuts)) {
    store.set('shortcuts', shortcuts)
  }

  if (!store.get('hotkeyMigrationV1')) {
    const migratedShortcuts = shortcuts.some((shortcut) => shortcut.kind === 'hotkey')
      ? shortcuts
      : [...shortcuts, DEFAULT_SHORTCUTS.find((shortcut) => shortcut.kind === 'hotkey')!]

    store.set('shortcuts', migratedShortcuts)
    store.set('hotkeyMigrationV1', true)
    return migratedShortcuts
  }

  return shortcuts
}

function saveShortcuts(shortcuts: unknown) {
  const normalizedShortcuts = normalizeShortcuts(shortcuts)
  store.set('shortcuts', normalizedShortcuts)

  const activeShortcutId = store.get('activeShortcutId') as string | undefined
  if (!activeShortcutId || !normalizedShortcuts.some((shortcut) => shortcut.id === activeShortcutId)) {
    store.set('activeShortcutId', normalizedShortcuts[0]?.id ?? '')
  }

  return normalizedShortcuts
}

function getActiveShortcutId() {
  const shortcuts = getShortcuts()
  const storedShortcutId = store.get('activeShortcutId') as string | undefined
  const activeShortcut = shortcuts.find((shortcut) => shortcut.id === storedShortcutId && shortcut.enabled)
    ?? shortcuts.find((shortcut) => shortcut.enabled)
    ?? shortcuts[0]

  return activeShortcut?.id ?? ''
}

function getLauncherMode(): LauncherMode {
  const mode = store.get('launcherMode')
  return mode === 'hotkey' ? 'hotkey' : 'launch'
}

function setLauncherMode(mode: unknown): LauncherMode {
  const nextMode = mode === 'hotkey' ? 'hotkey' : 'launch'
  store.set('launcherMode', nextMode)
  return nextMode
}

async function executeShortcut(shortcutId?: string) {
  const shortcuts = getShortcuts()
  const activeShortcutId = shortcutId || getActiveShortcutId()
  const shortcut = shortcuts.find((item) => item.id === activeShortcutId) ?? shortcuts[0]

  if (!shortcut || shortcut.enabled === false) {
    return
  }

  if (shortcut.kind === 'feishu-record') {
    await startFeishuRecording()
    return
  }

  if (shortcut.kind === 'app') {
    await openMacApp(shortcut.target)
    return
  }

  if (shortcut.kind === 'hotkey') {
    await sendHotkey(shortcut.target)
    return
  }

  await shell.openExternal(shortcut.target)
}

function createAppMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: APP_NAME,
      submenu: [
        {
          label: '显示悬浮按钮',
          click: () => {
            if (floatingWindow) {
              floatingWindow.show()
              floatingWindow.focus()
            } else {
              createFloatingWindow()
            }
          }
        },
        {
          label: '打开配置面板',
          accelerator: 'Command+,',
          click: () => showMainWindow()
        },
        {
          label: '执行当前快捷项',
          accelerator: 'Command+Return',
          click: () => executeShortcut()
        },
        {
          label: '隐藏悬浮按钮',
          click: () => floatingWindow?.hide()
        },
        { type: 'separator' },
        {
          label: '退出',
          accelerator: 'Command+Q',
          click: () => app.quit()
        }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' }
      ]
    }
  ]))
}

// 应用启动
app.whenReady().then(() => {
  app.setName(APP_NAME)

  if (process.platform === 'darwin') {
    app.dock.setIcon(getAssetPath('app-icon.png'))
  }

  createFloatingWindow()
  createMainWindow()
  createTray()
  createAppMenu()
  startFrontmostTracking()
  startWindowDropMonitor()

  ipcMain.handle('open-feishu-meeting', async () => {
    await startFeishuRecording()
  })

  ipcMain.handle('shortcuts:get', async () => getShortcuts())

  ipcMain.handle('shortcuts:save', async (_event, shortcuts) => saveShortcuts(shortcuts))

  ipcMain.handle('shortcut:execute', async (_event, shortcutId?: string) => {
    try {
      await executeShortcut(shortcutId)
    } catch (error) {
      console.error('执行快捷项失败:', error)
      throw error
    }
  })

  ipcMain.handle('shortcut:set-active', async (_event, shortcutId: string) => {
    const shortcuts = getShortcuts()
    const shortcut = shortcuts.find((item) => item.id === shortcutId)
    if (shortcut) {
      store.set('activeShortcutId', shortcut.id)
      return shortcut.id
    }

    return getActiveShortcutId()
  })

  ipcMain.handle('shortcut:get-active', async () => getActiveShortcutId())

  ipcMain.handle('launcher-mode:get', async () => getLauncherMode())

  ipcMain.handle('launcher-mode:set', async (_event, mode: unknown) => setLauncherMode(mode))

  ipcMain.handle('hotkey-recording:set', async (_event, isRecording: unknown) => {
    setHotkeyRecording(Boolean(isRecording))
  })

  ipcMain.handle('floating-position:get', async () => getFloatingButtonLocalPosition())

  ipcMain.handle('floating-position:set', async (_event, position: { x?: unknown; y?: unknown }) => {
    const x = Number(position?.x)
    const y = Number(position?.y)

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return getFloatingButtonLocalPosition()
    }

    const nextPosition = saveFloatingButtonLocalPosition({ x, y })
    const bounds = floatingWindow?.getBounds() ?? screen.getPrimaryDisplay().bounds
    return {
      x: nextPosition.x - bounds.x,
      y: nextPosition.y - bounds.y
    }
  })

  ipcMain.handle('open-main-window', async () => {
    showMainWindow()
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

  ipcMain.on('floating-mouse-passthrough', (_event, isPassthrough: boolean) => {
    setFloatingMousePassthrough(Boolean(isPassthrough))
  })

  ipcMain.on('floating-drag-start', () => {
    if (!floatingWindow) return

    suppressMainWindowActivation()
    setFloatingMousePassthrough(false)
  })

  ipcMain.on('floating-drag-move', () => {
    if (!floatingWindow) return

    suppressMainWindowActivation()
  })

  ipcMain.on('floating-drag-end', (_event, position?: { x?: unknown; y?: unknown }) => {
    suppressMainWindowActivation(1200)

    if (position) {
      const x = Number(position.x)
      const y = Number(position.y)

      if (Number.isFinite(x) && Number.isFinite(y)) {
        saveFloatingButtonLocalPosition({ x, y })
      }
    }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createFloatingWindow()
      createMainWindow()
    } else {
      floatingWindow?.show()
      showMainWindowFromActivation()
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
  setHotkeyRecording(false)
  stopWindowDropMonitor()

  if (frontmostTrackingTimer) {
    clearInterval(frontmostTrackingTimer)
    frontmostTrackingTimer = null
  }

  if (tray) {
    tray.destroy()
  }
})
