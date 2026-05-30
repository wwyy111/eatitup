import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  getShortcuts: () => ipcRenderer.invoke('shortcuts:get'),
  saveShortcuts: (shortcuts: unknown) => ipcRenderer.invoke('shortcuts:save', shortcuts),
  executeShortcut: (shortcutId?: string) => ipcRenderer.invoke('shortcut:execute', shortcutId),
  setActiveShortcut: (shortcutId: string) => ipcRenderer.invoke('shortcut:set-active', shortcutId),
  getActiveShortcut: () => ipcRenderer.invoke('shortcut:get-active'),
  setLauncherMode: (mode: string) => ipcRenderer.invoke('launcher-mode:set', mode),
  getLauncherMode: () => ipcRenderer.invoke('launcher-mode:get'),
  openFeishuMeeting: () => ipcRenderer.invoke('open-feishu-meeting'),
  openMainWindow: () => ipcRenderer.invoke('open-main-window'),
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  maximizeWindow: () => ipcRenderer.invoke('maximize-window'),
  closeWindow: () => ipcRenderer.invoke('close-window'),
  startFloatingDrag: (pointerPosition: { x: number; y: number }) => {
    ipcRenderer.send('floating-drag-start', pointerPosition)
  },
  moveFloatingWindow: (pointerPosition: { x: number; y: number }) => {
    ipcRenderer.send('floating-drag-move', pointerPosition)
  },
  endFloatingDrag: () => ipcRenderer.send('floating-drag-end')
})
