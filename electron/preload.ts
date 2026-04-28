import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // 打开飞书页面
  openFeishuMeeting: () => ipcRenderer.invoke('open-feishu-meeting'),
  // 窗口控制
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  maximizeWindow: () => ipcRenderer.invoke('maximize-window'),
  closeWindow: () => ipcRenderer.invoke('close-window'),
  // 拖拽相关
  startFloatingDrag: (pointerPosition: { x: number; y: number }) => {
    ipcRenderer.send('floating-drag-start', pointerPosition)
  },
  moveFloatingWindow: (pointerPosition: { x: number; y: number }) => {
    ipcRenderer.send('floating-drag-move', pointerPosition)
  },
  endFloatingDrag: () => ipcRenderer.send('floating-drag-end')
})
