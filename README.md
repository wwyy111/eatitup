# Feishu Recorder Floating Button

An Electron + React floating desktop button for opening Feishu/Lark Minutes and starting a recording through macOS desktop automation.

## Features

- Always-on-top floating button
- Saves the floating button position
- Opens Feishu/Lark Minutes through AppLink
- Uses macOS Accessibility automation to click the recording button
- System tray controls

## Setup

Install dependencies:

```bash
npm install
```

Run in development:

```bash
FEISHU_MINUTES_HOME_URL="https://your-tenant.feishu.cn/minutes/home" npm run electron:dev
```

Build:

```bash
npm run build
```

## macOS Permissions

Automatic recording uses AppleScript and macOS Accessibility. Enable permissions for the app or terminal used to launch it:

```text
System Settings -> Privacy & Security -> Accessibility
```

You may also need to allow automation access to System Events and Lark/Feishu:

```text
System Settings -> Privacy & Security -> Automation
```

## Privacy

Do not commit your real Feishu tenant URL, recording links, `.env` files, or generated build output. Use `.env.example` as a template.

The app reads the Minutes home URL from:

```bash
FEISHU_MINUTES_HOME_URL
```
