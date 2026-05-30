const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

if (process.platform !== 'darwin') {
  process.exit(0)
}

const projectRoot = path.join(__dirname, '..')
const sourcePath = path.join(__dirname, 'HotkeyRecorder.swift')
const outputDir = path.join(projectRoot, 'dist-electron')
const outputPath = path.join(outputDir, 'HotkeyRecorder')

fs.mkdirSync(outputDir, { recursive: true })
execFileSync('/usr/bin/swiftc', [sourcePath, '-o', outputPath], {
  stdio: 'inherit'
})
