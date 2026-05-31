import type { LauncherMode, Shortcut } from './shortcuts'

export {}

declare global {
  interface Window {
    electronAPI?: {
      getShortcuts: () => Promise<Shortcut[]>
      saveShortcuts: (shortcuts: Shortcut[]) => Promise<Shortcut[]>
      executeShortcut: (shortcutId?: string) => Promise<void>
      setActiveShortcut: (shortcutId: string) => Promise<string>
      getActiveShortcut: () => Promise<string>
      setLauncherMode: (mode: LauncherMode) => Promise<LauncherMode>
      getLauncherMode: () => Promise<LauncherMode>
      setHotkeyRecording: (isRecording: boolean) => Promise<void>
      onCapturedHotkey: (callback: (hotkey: string) => void) => () => void
      onShortcutAbsorbed: (callback: (name: string) => void) => () => void
      openFeishuMeeting: () => Promise<void>
      openMainWindow: () => Promise<void>
      getFloatingPosition: () => Promise<{ x: number; y: number }>
      setFloatingPosition: (position: { x: number; y: number }) => Promise<{ x: number; y: number }>
      minimizeWindow: () => Promise<void>
      maximizeWindow: () => Promise<void>
      closeWindow: () => Promise<void>
      startFloatingDrag: (pointerPosition: { x: number; y: number }) => void
      moveFloatingWindow: (pointerPosition: { x: number; y: number }) => void
      endFloatingDrag: (position?: { x: number; y: number }) => void
      setFloatingMousePassthrough: (isPassthrough: boolean) => void
    }
  }
}
