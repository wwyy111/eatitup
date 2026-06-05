import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  getShortcuts: () => ipcRenderer.invoke('shortcuts:get'),
  saveShortcuts: (shortcuts: unknown) => ipcRenderer.invoke('shortcuts:save', shortcuts),
  executeShortcut: (shortcutId?: string) => ipcRenderer.invoke('shortcut:execute', shortcutId),
  setActiveShortcut: (shortcutId: string) => ipcRenderer.invoke('shortcut:set-active', shortcutId),
  getActiveShortcut: () => ipcRenderer.invoke('shortcut:get-active'),
  setLauncherMode: (mode: string) => ipcRenderer.invoke('launcher-mode:set', mode),
  getLauncherMode: () => ipcRenderer.invoke('launcher-mode:get'),
  setHotkeyRecording: (isRecording: boolean) => ipcRenderer.invoke('hotkey-recording:set', isRecording),
  onCapturedHotkey: (callback: (hotkey: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, hotkey: string) => callback(hotkey)
    ipcRenderer.on('hotkey-recording:captured', listener)
    return () => ipcRenderer.removeListener('hotkey-recording:captured', listener)
  },
  onShortcutAbsorbed: (callback: (name: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, name: string) => callback(name)
    ipcRenderer.on('shortcuts:absorbed', listener)
    return () => ipcRenderer.removeListener('shortcuts:absorbed', listener)
  },
  openFeishuMeeting: () => ipcRenderer.invoke('open-feishu-meeting'),
  openMainWindow: () => ipcRenderer.invoke('open-main-window'),
  getFloatingPosition: () => ipcRenderer.invoke('floating-position:get'),
  setFloatingPosition: (position: { x: number; y: number }) => ipcRenderer.invoke('floating-position:set', position),
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  maximizeWindow: () => ipcRenderer.invoke('maximize-window'),
  closeWindow: () => ipcRenderer.invoke('close-window'),
  startFloatingDrag: (pointerPosition: { x: number; y: number }) => {
    ipcRenderer.send('floating-drag-start', pointerPosition)
  },
  moveFloatingWindow: (pointerPosition: { x: number; y: number }) => ipcRenderer.invoke('floating-drag-move', pointerPosition),
  endFloatingDrag: (position?: { x: number; y: number }) => ipcRenderer.send('floating-drag-end', position),
  setFloatingMousePassthrough: (isPassthrough: boolean) => {
    ipcRenderer.send('floating-mouse-passthrough', isPassthrough)
  }
})
