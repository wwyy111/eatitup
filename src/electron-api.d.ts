export {}

declare global {
  interface Window {
    electronAPI?: {
      openFeishuMeeting: () => Promise<void>
      minimizeWindow: () => Promise<void>
      maximizeWindow: () => Promise<void>
      closeWindow: () => Promise<void>
      startFloatingDrag: (pointerPosition: { x: number; y: number }) => void
      moveFloatingWindow: (pointerPosition: { x: number; y: number }) => void
      endFloatingDrag: () => void
    }
  }
}
