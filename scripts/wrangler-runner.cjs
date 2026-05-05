// Fix process.argv in Electron Node.js mode
// Electron duplicates argv[0] so argv looks like:
// ['electron.exe', 'electron.exe', 'this-script.cjs', 'wrangler-args...']
// We need cli.js to see process.argv.slice(2) = ['wrangler-args...']
const thisScript = __filename
const scriptIdx = process.argv.indexOf(thisScript)
if (scriptIdx >= 0) {
  process.argv = [process.argv[0], thisScript, ...process.argv.slice(scriptIdx + 1)]
}
require('../node_modules/wrangler/wrangler-dist/cli.js')
