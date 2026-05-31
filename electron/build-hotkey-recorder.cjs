const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

if (process.platform !== 'darwin') {
  process.exit(0)
}

const projectRoot = path.join(__dirname, '..')
const outputDir = path.join(projectRoot, 'dist-electron')

fs.mkdirSync(outputDir, { recursive: true })

for (const helperName of ['HotkeyRecorder', 'WindowDropMonitor']) {
  execFileSync('/usr/bin/swiftc', [
    path.join(__dirname, `${helperName}.swift`),
    '-o',
    path.join(outputDir, helperName)
  ], {
    stdio: 'inherit'
  })
}
