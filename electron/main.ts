import { app, BrowserWindow, shell, Tray, Menu, nativeImage, ipcMain, screen, systemPreferences, dialog } from 'electron'
import { execFile } from 'child_process'
import * as path from 'path'
import Store from 'electron-store'
import { DEFAULT_SHORTCUTS, type LauncherMode, type Shortcut } from '../src/shortcuts'

const store = new Store()
const FEISHU_MINUTES_HOME_URL = process.env.FEISHU_MINUTES_HOME_URL || 'https://www.feishu.cn/minutes/home'
const gotSingleInstanceLock = app.requestSingleInstanceLock()
const APP_NAME = '浮点启动台'
const SELF_PROCESS_IDS = new Set([process.pid])

let floatingWindow: BrowserWindow | null = null
let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let frontmostTrackingTimer: NodeJS.Timeout | null = null
let lastExternalApp: { name: string; processId: number } | null = null
let lastFloatingInteractionAt = 0
let dragState: {
  windowStartPosition: [number, number]
  pointerStartPosition: { x: number; y: number }
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
  const savedPosition = store.get('windowPosition', { x: -1, y: -1 }) as { x: number; y: number }

  floatingWindow = new BrowserWindow({
    width: 286,
    height: 220,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    focusable: false,
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
    floatingWindow.setPosition(x + width - 306, y + 20)
  }

  floatingWindow.on('move', () => {
    const [x, y] = floatingWindow!.getPosition()
    store.set('windowPosition', { x, y })
  })

  floatingWindow.on('closed', () => {
    floatingWindow = null
  })
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

function markFloatingInteraction() {
  lastFloatingInteractionAt = Date.now()
}

function showMainWindowFromActivation() {
  const activationStartedAt = Date.now()

  setTimeout(() => {
    if (lastFloatingInteractionAt >= activationStartedAt - 50) {
      return
    }

    showMainWindow()
  }, 140)
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

  return shortcuts.length > 0 ? shortcuts : DEFAULT_SHORTCUTS
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
    store.set('activeShortcutId', normalizedShortcuts[0].id)
  }

  return normalizedShortcuts
}

function getActiveShortcutId() {
  const shortcuts = getShortcuts()
  const storedShortcutId = store.get('activeShortcutId') as string | undefined
  const activeShortcut = shortcuts.find((shortcut) => shortcut.id === storedShortcutId && shortcut.enabled)
    ?? shortcuts.find((shortcut) => shortcut.enabled)
    ?? shortcuts[0]

  return activeShortcut.id
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

  ipcMain.handle('open-main-window', async () => {
    showMainWindow()
  })

  ipcMain.on('floating-interaction', () => {
    markFloatingInteraction()
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

    markFloatingInteraction()
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
      createMainWindow()
    } else {
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
  if (frontmostTrackingTimer) {
    clearInterval(frontmostTrackingTimer)
    frontmostTrackingTimer = null
  }

  if (tray) {
    tray.destroy()
  }
})
