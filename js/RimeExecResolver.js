const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const WEASEL_DEPLOYER = 'WeaselDeployer.exe'
const WINDOWS_RIME_ROOTS = [
    'C:/Program Files/Rime',
    'C:/Program Files (x86)/Rime',
]

function fileExists(filePath) {
    try {
        return fs.existsSync(filePath) && fs.statSync(filePath).isFile()
    } catch {
        return false
    }
}

function dirExists(dirPath) {
    try {
        return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()
    } catch {
        return false
    }
}

function getDeployerPath(execDir) {
    return path.join(execDir, WEASEL_DEPLOYER)
}

function isValidWeaselExecDir(execDir) {
    return Boolean(execDir) && fileExists(getDeployerPath(execDir))
}

function parseWeaselVersion(folderName) {
    const match = folderName.match(/(\d+(?:\.\d+)+)/)
    if (!match) {
        return null
    }
    return match[1].split('.').map(part => {
        const num = parseInt(part, 10)
        return Number.isNaN(num) ? 0 : num
    })
}

function compareVersionParts(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b)) {
        if (Array.isArray(a)) return 1
        if (Array.isArray(b)) return -1
        return 0
    }
    const len = Math.max(a.length, b.length)
    for (let i = 0; i < len; i++) {
        const av = a[i] || 0
        const bv = b[i] || 0
        if (av !== bv) {
            return av - bv
        }
    }
    return 0
}

function listWeaselInstallDirs(rimeRoot) {
    if (!dirExists(rimeRoot)) {
        return []
    }
    let entries
    try {
        entries = fs.readdirSync(rimeRoot, { withFileTypes: true })
    } catch {
        return []
    }
    return entries
        .filter(entry => entry.isDirectory() && /weasel/i.test(entry.name))
        .map(entry => path.join(rimeRoot, entry.name))
        .filter(isValidWeaselExecDir)
}

function pickLatestWeaselDir(candidates) {
    if (candidates.length === 0) {
        return null
    }
    return candidates.slice().sort((dirA, dirB) => {
        const versionA = parseWeaselVersion(path.basename(dirA))
        const versionB = parseWeaselVersion(path.basename(dirB))
        if (versionA && versionB) {
            const cmp = compareVersionParts(versionA, versionB)
            if (cmp !== 0) {
                return cmp
            }
        }
        return fs.statSync(getDeployerPath(dirB)).mtimeMs - fs.statSync(getDeployerPath(dirA)).mtimeMs
    })[candidates.length - 1]
}

function normalizeConfiguredExecDir(configDir) {
    if (!configDir || !dirExists(configDir)) {
        return null
    }
    if (isValidWeaselExecDir(configDir)) {
        return configDir
    }
    return pickLatestWeaselDir(listWeaselInstallDirs(configDir))
}

function findWeaselDeployerViaWhere() {
    try {
        const output = execSync('where WeaselDeployer.exe', {
            encoding: 'utf8',
            windowsHide: true,
        })
        const deployerPath = output
            .split(/\r?\n/)
            .map(line => line.trim())
            .find(Boolean)
        if (deployerPath && fileExists(deployerPath)) {
            const execDir = path.dirname(deployerPath)
            return isValidWeaselExecDir(execDir) ? execDir : null
        }
    } catch {
        return null
    }
    return null
}

function discoverLatestWeaselExecDir() {
    const candidates = []
    WINDOWS_RIME_ROOTS.forEach(root => {
        candidates.push(...listWeaselInstallDirs(root))
    })
    return pickLatestWeaselDir(candidates)
}

function resolveRimeExecDirWin(configRimeExecDir) {
    const configured = normalizeConfiguredExecDir(configRimeExecDir)
    if (configured) {
        return configured
    }

    const fromPath = findWeaselDeployerViaWhere()
    if (fromPath) {
        return fromPath
    }

    return discoverLatestWeaselExecDir()
}

function getMacRimeExecDir() {
    const squirrelDir = path.join('/Library/Input Methods/Squirrel.app', 'Contents/MacOS')
    const squirrelBin = path.join(squirrelDir, 'Squirrel')
    if (fileExists(squirrelBin)) {
        return squirrelDir
    }
    return squirrelDir
}

// Linux 下 Rime 部署需要外部命令行工具：
//   rime_deployer --build <userDataDir>  → 同步 yaml/build 出 .bin
//   通知前端重载：fcitx5/ibus/fcitx4 各有不同方式
// 返回哪个部署器可用 + 哪个数据目录（与 getRimeConfigDir 保持一致）
function detectLinuxRimeDeployer(userHome) {
    const candidates = [
        {
            // fcitx5-rime：fcitx5-remote -r 不能让 rime 重新读 build/*.bin（只重载 fcitx5 配置），
            // 真正能重载 rime 数据的是 SetSchema 切走再切回（DBus）
            frontend: 'fcitx5',
            deployCmd: 'rime_deployer',
            // reload 策略：'dbus-schema-switch' 用 gdbus SetSchema 切走再切回
            // 备选 schema 用 pinyin_simp（几乎所有 fcitx5 用户都装了的）
            reloadStrategy: 'dbus-schema-switch',
            deploySchema: 'wubi86_jidian',
            fallbackSchema: 'pinyin_simp',
            dataDir: path.join(userHome, '.local', 'share', 'fcitx5', 'rime'),
        },
        {
            // ibus-rime：ibus restart 真的能重载（ibus 重启会重新初始化 rime addon）
            frontend: 'ibus',
            deployCmd: 'rime_deployer',
            reloadStrategy: 'command',
            reloadCmd: 'ibus',
            reloadArgs: ['restart'],
            dataDir: path.join(userHome, '.config', 'ibus', 'rime'),
        },
        {
            // fcitx4-rime：fcitx4-remote -r 真的能重载
            frontend: 'fcitx4',
            deployCmd: 'rime_deployer',
            reloadStrategy: 'command',
            reloadCmd: 'fcitx4-remote',
            reloadArgs: ['-r'],
            dataDir: path.join(userHome, '.config', 'fcitx', 'rime'),
        },
    ]
    // 1) 优先选数据目录真实存在的前端（用户真的用了这个）
    for (const c of candidates) {
        if (dirExists(c.dataDir) && commandExists(c.deployCmd)) {
            return c
        }
    }
    // 2) 退而求其次：只装好了 deployer
    for (const c of candidates) {
        if (commandExists(c.deployCmd)) {
            return c
        }
    }
    return null
}

function commandExists(cmd) {
    // PATH 查找；避免 shell 注入（cmd 是固定白名单）
    if (typeof cmd !== 'string' || /[^a-zA-Z0-9_.-]/.test(cmd)) return false
    const pathEnv = process.env.PATH || ''
    const dirs = pathEnv.split(path.delimiter)
    for (const d of dirs) {
        if (!d) continue
        const full = path.join(d, cmd)
        try {
            if (fs.statSync(full).isFile()) return true
        } catch (_) {}
    }
    return false
}

function getRimeExecDir(platform, configRimeExecDir = '') {
    switch (platform) {
        case 'darwin':
            return getMacRimeExecDir()
        case 'win32':
            return resolveRimeExecDirWin(configRimeExecDir)
        case 'linux': {
            // Linux 不再走「找 WeaselDeployer.exe」的概念；
            // 直接返回可用的部署器描述符（给 main.js 的 applyRime 使用）
            return detectLinuxRimeDeployer(process.env.HOME || '')
        }
        default:
            return null
    }
}

module.exports = {
    WEASEL_DEPLOYER,
    WINDOWS_RIME_ROOTS,
    parseWeaselVersion,
    compareVersionParts,
    isValidWeaselExecDir,
    normalizeConfiguredExecDir,
    resolveRimeExecDirWin,
    getMacRimeExecDir,
    detectLinuxRimeDeployer,
    getRimeExecDir,
    discoverLatestWeaselExecDir,
}
