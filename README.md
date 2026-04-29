# Float Launcher

An Electron + React floating shortcut launcher. It ships with a Feishu Minutes recording action, and can also launch websites/platforms or local macOS apps from the same floating button.

## Features

- Always-on-top floating button
- Switch active shortcuts from the floating control
- Configure shortcuts in a graphical desktop panel
- Supports Feishu Minutes recording, web links, and local app launch
- Saves shortcut configuration and floating button position locally

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

Feishu recording uses AppleScript and macOS Accessibility. Enable permissions for the app or terminal used to launch it:

```text
System Settings -> Privacy & Security -> Accessibility
```

In the current development launcher, the item macOS asks you to allow is usually `Electron`.
After enabling it, quit and reopen the app.

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
