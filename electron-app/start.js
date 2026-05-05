const { spawn } = require('child_process')
const electronPath = require('./node_modules/electron')
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
spawn(electronPath, ['.'], { stdio: 'inherit', cwd: __dirname, env })
  .on('close', (code) => process.exit(code || 0))
