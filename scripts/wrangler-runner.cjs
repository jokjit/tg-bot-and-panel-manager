const path = require('path')

function norm(p) {
  try {
    return path.resolve(String(p)).replace(/\//g, '\\').toLowerCase()
  } catch {
    return String(p || '').replace(/\//g, '\\').toLowerCase()
  }
}

// Fix process.argv in Electron Node.js mode.
// Electron may duplicate argv[0] and mutate argv[1], so we normalize by finding
// the runner script position via exact/normalized/path-suffix matching.
const thisScript = __filename
const thisNorm = norm(thisScript)

let scriptIdx = process.argv.findIndex((arg) => norm(arg) === thisNorm)
if (scriptIdx < 0) {
  scriptIdx = process.argv.findIndex((arg) => /(?:\\|\/)wrangler-runner\.cjs$/i.test(String(arg || '')))
}

if (scriptIdx >= 0) {
  process.argv = [process.argv[0], thisScript, ...process.argv.slice(scriptIdx + 1)]
} else if (process.argv.length >= 3) {
  // Fallback: keep argv[0], force argv[1] to this script, preserve following args.
  process.argv = [process.argv[0], thisScript, ...process.argv.slice(2)]
}

require('../node_modules/wrangler/wrangler-dist/cli.js')
