#!/usr/bin/env node
/**
 * Patches @electron/packager's unzip.js to use the system `unzip` binary
 * instead of `extract-zip@2.0.1`.
 *
 * Why:
 *   extract-zip@2.0.1 (used by the original unzip.js) silently exits after
 *   extracting only the first entry of electron-v28.x's archive on Node v22+.
 *   electron-packager's `package` step hangs forever at "Packaging for x64 on
 *   linux" with no progress and no error. spawn'ing the system `unzip`
 *   extracts the whole archive in ~1.5s and is rock-solid.
 *
 * Idempotent: detects the already-patched file and exits 0.
 */
'use strict'

const fs = require('fs')
const path = require('path')

const TARGET = path.join(
    __dirname, '..', 'node_modules',
    '@electron', 'packager', 'dist', 'unzip.js'
)

const PATCH_MARK = 'spawn(\n            "unzip"'

const PATCHED_BODY =
    '"use strict";\n' +
    'Object.defineProperty(exports, "__esModule", { value: true });\n' +
    'exports.extractElectronZip = void 0;\n' +
    '\n' +
    'const child_process = require("child_process");\n' +
    'const fs = require("fs");\n' +
    '\n' +
    '// Patched for Node v22+ compatibility: extract-zip@2.0.1 (used by the\n' +
    '// original implementation) silently exits after extracting only the\n' +
    '// first entry of electron-v28.x\'s archive on Node >= 22. Fall back to\n' +
    '// system `unzip`, which completes the whole archive in ~1.5s.\n' +
    'async function extractElectronZip(zipPath, targetDir) {\n' +
    '    await fs.promises.mkdir(targetDir, { recursive: true });\n' +
    '    await new Promise((resolve, reject) => {\n' +
    '        const proc = child_process.spawn(\n' +
    '            "unzip",\n' +
    '            ["-q", "-o", zipPath, "-d", targetDir],\n' +
    '            { stdio: ["ignore", "inherit", "inherit"] }\n' +
    '        );\n' +
    '        proc.on("error", reject);\n' +
    '        proc.on("exit", (code) => {\n' +
    '            if (code === 0) resolve();\n' +
    '            else reject(new Error(`unzip exited with code ${code} for ${zipPath}`));\n' +
    '        });\n' +
    '    });\n' +
    '}\n' +
    '\n' +
    'exports.extractElectronZip = extractElectronZip;\n'

function main() {
    if (!fs.existsSync(TARGET)) {
        // Module not installed yet (clean clone, before npm install). Skip silently.
        process.exit(0)
    }
    const current = fs.readFileSync(TARGET, 'utf8')
    if (current.includes(PATCH_MARK)) {
        // Already patched
        process.exit(0)
    }
    fs.writeFileSync(TARGET, PATCHED_BODY)
    console.log('[fix-extract-zip] patched @electron/packager/dist/unzip.js to use system unzip')
}

main()