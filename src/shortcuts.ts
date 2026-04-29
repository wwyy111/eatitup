export type LauncherMode = 'launch' | 'hotkey'
export type ShortcutKind = 'feishu-record' | 'url' | 'app' | 'hotkey'

export type Shortcut = {
  id: string
  name: string
  kind: ShortcutKind
  target: string
  accent: string
  symbol: string
  enabled: boolean
}

export const DEFAULT_SHORTCUTS: Shortcut[] = [
  {
    id: 'feishu-minutes-record',
    name: '飞书妙记录音',
    kind: 'feishu-record',
    target: 'FEISHU_MINUTES_HOME_URL',
    accent: '#3370ff',
    symbol: 'rec',
    enabled: true
  },
  {
    id: 'screenshot-hotkey',
    name: '区域截图',
    kind: 'hotkey',
    target: 'Command+Shift+4',
    accent: '#f59e0b',
    symbol: 'key',
    enabled: true
  },
  {
    id: 'feishu-minutes-home',
    name: '飞书妙记主页',
    kind: 'url',
    target: 'https://www.feishu.cn/minutes/home',
    accent: '#22c55e',
    symbol: 'doc',
    enabled: true
  }
]

export const SHORTCUT_KIND_LABEL: Record<ShortcutKind, string> = {
  'feishu-record': '自动化',
  url: '网页/平台',
  app: '本机 App',
  hotkey: '快捷键'
}
