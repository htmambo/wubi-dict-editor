// Windows Squirrel 安装/更新时自动退出，避免重复启动
if (require('electron-squirrel-startup')) {
    require('electron').app.quit()
}

const {app, globalShortcut, BrowserWindow, Menu, ipcMain, shell, dialog, net, Notification} = require('electron')

// 强制设置应用名为 package.json#name
// 默认情况下 Electron 在 Linux 上会用 process.execPath 的 basename（=WubiDictEditor，来自
// forge.config.js 的 executableName）作为 X11 WM_CLASS，与 .desktop 的 StartupWMClass 不一致，
// 导致任务栏 / Alt+Tab 切换器里窗口图标显示为空白。
// 显式 setName 后窗口 WM_CLASS = wubi-dict-editor，与 deb .desktop 的 StartupWMClass 匹配。
app.setName('WubiDictEditor')
// setName 只改 app.getName()，不一定改窗口的 _NET_WM_CLASS。
// 在 Linux 上额外设置 process.title，Electron 早期版本会把它作为 X11 WMClass 的 instance/class
// 的派生源之一；这一步在部分桌面环境（Deepin dde-kwin / GNOME Shell）下能强制让 WMClass 跟随应用名。
process.title = 'WubiDictEditor'
const {exec} = require('child_process')
const fs = require('fs')
const os = require('os')
const url = require("url")
const path = require("path")
const {shakeDom, log, shakeDomFocus, dateFormatter, unicodeBase64Encode, unicodeBase64Decode} = require('./js/Utility')
const {
    DEFAULT_BASE_URL,
    IS_REQUEST_LOCAL,
    IS_IN_DEVELOP,
    CONFIG_FILE_PATH,
    CONFIG_FILE_NAME,
    DEFAULT_CONFIG,
    CONFIG_DICT_MAP_FILE_NAME,
    SYNC_MAX_WORD_COUNT = 40000 // 兜底默认值，防止 Global 导出变更时消息渲染为 "undefined"
} = require('./js/Global')
const plist = require("plist")
const wubiApi = require("./js/wubiApi")
const rimeExecResolver = require('./js/RimeExecResolver')
const { getRimeExecDir, WEASEL_DEPLOYER, normalizeConfiguredExecDir } = rimeExecResolver
const pkg = require('./package.json')

// 应用元信息（关于窗口 + 菜单展示用）
const APP_META = {
    displayName: '五笔码表助手',        // 用户可见名称（中文）
    appName: pkg.name,                  // 包名/可执行名（ASCII，用于系统识别）
    productName: 'WubiDictEditor',       // packager 产物名
    version: pkg.version,                // 版本号
    authorName: 'KyleBing',
    authorEmail: 'kylebing@163.com',
    homepage: 'https://github.com/KyleBing/wubi-dict-editor',
    copyrightYear: '2021-2026',
    description: pkg.description || '五笔码表管理工具',
}

let mainWindow // 主窗口
let fileList = [] // 文件目录列表，用于移动词条

function createMainWindow() {
    let width = IS_IN_DEVELOP ? 1800 : 1250
    let height = 800
    mainWindow = new BrowserWindow({
        width,
        height,
        icon: __dirname + '/assets/img/appIcon/appIcon.ico', // windows icon
        // icon: __dirname + '/assets/appIcon/linux.png', // linux icon
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    })

    if (IS_IN_DEVELOP) {
        mainWindow.webContents.openDevTools() // 打开调试窗口
    }

    mainWindow.loadURL(
        url.format({
            pathname: path.join(__dirname, './view/index/index.html'),
            protocol: "file:",
            slashes: true
        })
    )
    mainWindow.on('closed', function () {
        mainWindow = null
        if (configWindow) configWindow.close()
        if (toolWindow) toolWindow.close()
    })
    mainWindow.on('show', ()=> {
        console.log('main window:showed')
        mainWindow.send('MainWindow:onWindowShowed') // 向 vue 发送窗口显示的事件
    })

    // 保存词库到文件
    ipcMain.on('saveFile', (event, filename, yamlString) => {
        fs.writeFile(path.join(getRimeConfigDir(), filename), yamlString, {encoding: "utf8"}, err => {
            if (!err) {
                console.log('saveFileSuccess')
                try {
                    applyRime() // 部署
                } catch (err) {
                    console.log('获取程序目录失败')
                }
                mainWindow.webContents.send('saveFileSuccess')
            }
        })
    })

    // 监听 window 的文件载入请求
    ipcMain.on('loadInitDictFile', event => {
        let config = readConfigFile()
        readFileFromConfigDir(config.initFileName)
    })

    // 监听载入主文件内容的请求
    ipcMain.on('loadDictFile', (event, filename) => {
        readFileFromConfigDir(filename)
    })

    // 监听载入次文件内容的请求
    ipcMain.on('MainWindow:LoadSecondDict', (event, filename) => {
        let filePath = path.join(getRimeConfigDir(), filename)
        fs.readFile(filePath, {encoding: 'utf-8'}, (err, res) => {
            if (err) {
                console.log(err)
            } else {
                mainWindow.webContents.send('setTargetDict', filename, filePath, res)
            }
        })
    })

    ipcMain.on('MainWindow:LoadPinyinDict', (event, filename) => {
        let filePath = path.join(getRimeConfigDir(), filename)
        fs.readFile(filePath, {encoding: 'utf-8'}, (err, res) => {
            if (err) {
                mainWindow.webContents.send('MainWindow:PinyinDictLoadError', err.message)
            } else {
                mainWindow.webContents.send('MainWindow:PinyinDictLoaded', filename, filePath, res)
            }
        })
    })

    // 监听载入主文件内容的请求
    ipcMain.on('loadMainDict', event => {
        let config = readConfigFile()
        let mainDictFileName = config.mainDictFileName || DEFAULT_CONFIG.mainDictFileName
        fs.readFile(path.join(getRimeConfigDir(), mainDictFileName), {encoding: 'utf-8'}, (err, res) => {
            if (err) {
                console.log(err)
            } else {
                mainWindow.webContents.send('setMainDict', path.join(getRimeConfigDir(), mainDictFileName), res)
            }
        })
    })

    // 外部打开当前码表文件
    ipcMain.on('openFileOutside', (event, filename) => {
        shell.openPath(path.join(getRimeConfigDir(), filename)).then(res => {
            console.log(res)
        }).catch(err => {
            console.log(err)
        })
    })
    ipcMain.on('GetFileList', event => {
        mainWindow.send('FileList', fileList)
    })

    // config 相关，载入配置文件内容
    ipcMain.on('MainWindow:RequestConfigFile', event => {
        let config = readConfigFile() // 没有配置文件时，返回 false
        if (config) { // 如果有配置文件
            mainWindow.send('MainWindow:ResponseConfigFile', config) // 向窗口发送 config 内容
        }
    })
    // 保存配置文件内容
    ipcMain.on('saveConfigFileFromMainWindow', (event, configString) => {
        writeConfigFile(configString, mainWindow)
    })

    // 响应所有请求 dictMap 的请求
    ipcMain.on('getDictMap', event => {
        let dictMapFilePath = path.join(getAppConfigDir(), CONFIG_DICT_MAP_FILE_NAME)
        let dictMapFileContent = readFileFromDisk(dictMapFilePath)
        if (dictMapFileContent) {
            if (mainWindow) mainWindow.send('setDictMap', dictMapFileContent, CONFIG_DICT_MAP_FILE_NAME, dictMapFilePath)
            if (toolWindow) toolWindow.send('setDictMap', dictMapFileContent, CONFIG_DICT_MAP_FILE_NAME, dictMapFilePath)
        } else {
            // 如果没有设置码表字典文件，使用默认配置目录中的码表文件作为字典文件
            let rimeWubiDefaultDictFilePath = path.join(getRimeConfigDir(), 'wubi86_jidian.dict.yaml')
            let originalDictFileContent = readFileFromDisk(rimeWubiDefaultDictFilePath)
            if (originalDictFileContent) {
                if (mainWindow) mainWindow.send('setDictMap', originalDictFileContent, CONFIG_DICT_MAP_FILE_NAME, dictMapFilePath)
                if (toolWindow) toolWindow.send('setDictMap', originalDictFileContent, CONFIG_DICT_MAP_FILE_NAME, dictMapFilePath)
            }
        }
    })

    // 保存选中词条到 plist 文件
    ipcMain.on('MainWindow:ExportSelectionToPlistFile', (event, wordsSelected) => {

        let wordsProcessed = wordsSelected.map(item => {
            return {
                phrase: item.word,
                shortcut: item.code
            }
        })
        let plistContentString = plist.build(wordsProcessed)
        let exportFilePath = path.join(os.homedir(), 'Desktop', 'wubi-jidian86-export.plist')

        fs.writeFile(
            exportFilePath,
            plistContentString,
            {encoding: 'utf-8'},
            err => {
                if (err) {
                    console.log(err)
                } else {
                    // notification
                    if (Notification.isSupported()) {
                        new Notification({
                            title: '已成功导出文件',
                            subtitle: `文件路径：${exportFilePath}`, // macOS
                            body: `文件路径：${exportFilePath}`
                        }).show()
                    }
                }
            })
    })


    // 获取线上词库：增量同步本地词库
    ipcMain.on('MainWindow:sync.get:INCREASE', (event, {fileName, userInfo}) => {
        getOnlineDictContent(fileName, userInfo)
            .then(res => {
                if (res.data && res.data.content) {
                    res.data.content = Buffer.from(res.data.content, "base64").toString()
                }
                mainWindow.send('MainWindow:sync.get:INCREASE:SUCCESS', res)
            })
            .catch(err => {
                console.log(err)
            })
    })
    // 获取线上词库：覆盖本地词库
    ipcMain.on('MainWindow:sync.get:OVERWRITE', (event, {fileName, userInfo}) => {
        getOnlineDictContent(fileName, userInfo)
            .then(res => {
                if (res.data && res.data.content) {
                    res.data.content = Buffer.from(res.data.content, "base64").toString()
                }
                mainWindow.send('MainWindow:sync.get:OVERWRITE:SUCCESS', res)
            })
            .catch(err => {
                console.log(err)
            })
    })

    function getOnlineDictContent(dictName, userInfo) {
        let config = readConfigFile() // 没有配置文件时，返回 false
        return wubiApi.pullDictFileContent(userInfo,{
            title: dictName,
        }, config.baseURL)
    }

    // 保存至线上词库，如果存在覆盖它
    ipcMain.on('MainWindow:sync.save', (event, {fileName, fileContentYaml, wordCount, userInfo}) => {
        console.log('MainWindow:sync.save', fileName)
        if (fileContentYaml.length < SYNC_MAX_WORD_COUNT) { // 限制整个文件的大小
            let finalContent = Buffer.from(fileContentYaml).toString('base64')
            console.log('content size original: ', fileContentYaml.length)
            console.log('content size escaped: ', (escape(fileContentYaml)).length)
            console.log('content size unicodeEncode: ', finalContent.length)

            let config = readConfigFile() // 没有配置文件时，返回 false

            console.log('config: ', config)
            wubiApi
                .pushDictFileContent(
                    userInfo,
                    {
                        title: fileName,
                        content: finalContent, // 为了避免一些标点干扰出现的问题，直接全部转义，
                        contentSize: fileContentYaml.length,
                        wordCount: wordCount,
                    }, config.baseURL)
                .then(res => {
                    mainWindow.send('MainWindow:sync.save:SUCCESS', res.data)
                })
                .catch(err => {
                    mainWindow.send('MainWindow:sync.save:FAIL', '上传失败')
                    console.log(err)
                })
        } else {
            mainWindow.send('MainWindow:sync.save:FAIL', `同步内容超过 ${SYNC_MAX_WORD_COUNT} 字符`)
        }
    })


    // 载入文件内容
    ipcMain.on('MainWindow:LoadFile', (event, fileName) => {
        readFileFromConfigDir(fileName, mainWindow)
    })
    // 载入文件内容
    ipcMain.on('MainWindow:ApplyRime', event => {
        const result = applyRime()
        if (mainWindow) {
            mainWindow.send('MainWindow:ApplyRime:Result', result)
        }
    })
}

let toolWindow

function showToolWindow() {
    let width = IS_IN_DEVELOP ? 1400 : 1000
    let height = IS_IN_DEVELOP ? 600 : 600
    toolWindow = new BrowserWindow({
        width,
        height,
        icon: __dirname + '/assets/img/appIcon/appIcon.ico', // windows icon
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    })

    if (IS_IN_DEVELOP) {
        toolWindow.webContents.openDevTools() // 打开调试窗口
    }

    toolWindow.loadURL(
        url.format({
            pathname: path.join(__dirname, 'view/tool/tool.html'),
            protocol: "file:",
            slashes: true
        })
    )
    toolWindow.on('closed', function () {
        let listeners = [
            'ToolWindow:RequestConfigFile',
            'ToolWindow:chooseDictFile',
            'ToolWindow:SaveFile',
            'ToolWindow:loadFileContent',
            'ToolWindow:openFileOutside',
            'ToolWindow:GetFileList',
            'ToolWindow:LoadTargetDict'
        ]
        listeners.forEach(item => {
            ipcMain.removeAllListeners(item)
        })
        toolWindow = null
        if (mainWindow) mainWindow.show()
    })


    // 保存选中词条到 plist 文件
    ipcMain.on('ToolWindow:ExportSelectionToPlistFile', (event, wordsSelected) => {

        let wordsProcessed = wordsSelected.map(item => {
            return {
                phrase: item.word,
                shortcut: item.code
            }
        })
        let plistContentString = plist.build(wordsProcessed)
        let exportFilePath = path.join(os.homedir(), 'Desktop', 'wubi-jidian86-export.plist')

        fs.writeFile(
            exportFilePath,
            plistContentString,
            {encoding: 'utf-8'},
            err => {
                if (err) {
                    console.log(err)
                } else {
                    // notification
                    if (Notification.isSupported()) {
                        new Notification({
                            title: '已成功导出文件',
                            subtitle: `文件路径：${exportFilePath}`, // macOS
                            body: `文件路径：${exportFilePath}`
                        }).show()
                    }
                }
            })
    })


    // 选取码表文件目录
    ipcMain.on('ToolWindow:chooseDictFile', event => {
        let dictFilePath = dialog.showOpenDialogSync(toolWindow, {
            filters: [
                {name: 'Text', extensions: ['text', 'txt', 'yaml']},
            ],
            properties: ['openFile'] // 选择文件
        })
        console.log(dictFilePath)
        if (dictFilePath) {
            readFileFromDiskAndResponse(dictFilePath[0], toolWindow)
        }
    })

    // 监听载入主文件内容的请求
    ipcMain.on('ToolWindow:loadMainDict', event => {
        let mainDictFileName = 'wubi86_jidian.dict.yaml'
        fs.readFile(path.join(getRimeConfigDir(), mainDictFileName), {encoding: 'utf-8'}, (err, res) => {
            if (err) {
                console.log(err)
            } else {
                toolWindow.webContents.send('ToolWindow:setMainDict', path.join(getRimeConfigDir(), mainDictFileName), res)
            }
        })
    })

    // 保存词库到文件
    ipcMain.on('ToolWindow:SaveFile', (event, filePath, fileConentString) => {
        fs.writeFile(filePath, fileConentString, {encoding: "utf8"}, err => {
            if (!err) {
                console.log('saveFileSuccess')
                // applyRime() // 部署
                toolWindow.webContents.send('saveFileSuccess')
            }
        })
    })

    // 监听 window 的文件载入请求
    ipcMain.on('ToolWindow:loadFileContent', (event, filePath) => {
        readFileFromDiskAndResponse(filePath, toolWindow)
    })

    // 外部打开当前码表文件
    ipcMain.on('ToolWindow:openFileOutside', (event, filename) => {
        shell.openPath(path.join(getRimeConfigDir(), filename)).then(res => {
            console.log(res)
        }).catch(err => {
            console.log(err)
        })
    })

    ipcMain.on('ToolWindow:GetFileList', event => {
        toolWindow.send('ToolWindow:FileList', fileList)
    })

    // 监听载入次文件内容的请求
    ipcMain.on('ToolWindow:LoadTargetDict', (event, filename) => {
        let filePath = path.join(getRimeConfigDir(), filename)
        fs.readFile(filePath, {encoding: 'utf-8'}, (err, res) => {
            if (err) {
                console.log(err)
            } else {
                toolWindow.webContents.send('ToolWindow:SetTargetDict', filename, filePath, res)
            }
        })
    })

    // config 相关
    ipcMain.on('ToolWindow:RequestConfigFile', event => {
        let config = readConfigFile() // 没有配置文件时，返回 false

        if (config) { // 如果有配置文件
            if (toolWindow) { // 如果有配置文件
                toolWindow.send('ToolWindow:ResponseConfigFile', config) // 向窗口发送 config 内容
            }
        }
    })
}


// 读取文件 从硬盘
function readFileFromDisk(filePath) {
    try {
        return fs.readFileSync(filePath, {encoding: 'utf-8'})
    } catch (e) {
        return false
    }
}

// 读取文件并回馈给指定窗口
function readFileFromDiskAndResponse(filePath, responseWindow) {
    let fileName = path.basename(filePath) // 获取文件名
    let fileContent = readFileFromDisk(filePath)
    if (fileContent) {
        responseWindow.send('showFileContent', fileName, filePath, fileContent)
    } else {
        console.log('读取文件错误')
    }
}


let configWindow

function createConfigWindow() {
    let width = IS_IN_DEVELOP ? 1400 : 800
    let height = IS_IN_DEVELOP ? 600 : 600
    // TODO：打开配置窗口的时候，先创建配置文件夹，供后面保存配置文件和字典文件使用

    // 判断 config 文件夹是否存在
    let configDir = getAppConfigDir()
    console.log(configDir)
    if (!fs.existsSync(configDir)) {
        console.log('create config dir', configDir)
        fs.mkdirSync(configDir) // 创建目录

    }

    configWindow = new BrowserWindow({
        width,
        height,
        icon: __dirname + '/assets/img/appIcon/appIcon.ico', // windows icon
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    })

    if (IS_IN_DEVELOP) {
        configWindow.webContents.openDevTools() // 打开调试窗口
    }


    configWindow.loadURL(
        url.format({
            pathname: path.join(__dirname, 'view/config/config.html'),
            protocol: "file:",
            slashes: true
        })
    )
    configWindow.on('closed', function () {
        let listeners = [
            'requestFileList',
            'ConfigWindow:RequestSaveConfig',
            'ConfigWindow:ChooseRimeHomeDir',
            'ConfigWindow:SetDictMapFile',
        ]
        listeners.forEach(item => {
            ipcMain.removeAllListeners(item)
        })
        configWindow = null
        if (toolWindow) toolWindow.show()
        if (mainWindow) mainWindow.show()
    })


    // 处理登录请求
    ipcMain.on('ConfigWindow:Login', (event, userInfo) => {
        let requestData = {
            email: userInfo.email,
            password: userInfo.password,
        }

        let config = readConfigFile()

        // 1. 新建 net.request 请求
        let baseURL = config.baseURL || DEFAULT_BASE_URL // 当配置文件中没有值时，使用默认值

        const request = net.request({
            headers: {
                'Content-Type': 'application/json',
            },
            method: 'POST',
            url: IS_REQUEST_LOCAL ?
                'http://localhost:3000/user/login' :
                `${baseURL}/user/login`
        })
        // 2. 通过 request.write() 方法，发送的 post 请求数据需要先进行序列化，变成纯文本的形式
        request.write(JSON.stringify(requestData))

        // 3. 处理返回结果
        request.on('response', response => {
            response.on('data', res => {
                console.log(res.toString())
                // res 是 Buffer 数据
                // 通过 toString() 可以转为 String
                // 详见： https://blog.csdn.net/KimBing/article/details/124299412
                let data = JSON.parse(res.toString())
                configWindow.send('ConfigWindow:ResponseLogin', data)
            })
            response.on('end', () => {
            })
        })

        // 4. 记得关闭请求
        request.end()


    })

    // 载入文件列表
    ipcMain.on('requestFileList', event => {
        configWindow.send('responseFileList', fileList)
    })

    // config 相关
    ipcMain.on('ConfigWindow:RequestConfigFile', event => {
        let config = readConfigFile() // 没有配置文件时，返回 false
        if (config) { // 如果有配置文件
            if (configWindow) { // 如果有配置文件
                configWindow.send('ConfigWindow:ResponseConfigFile', config) // 向窗口发送 config 内容
            }
        }
    })

    // 保存配置文件内容
    ipcMain.on('ConfigWindow:RequestSaveConfig', (event, configString) => {
        writeConfigFile(configString)
    })

    // 选取配置文件目录
    ipcMain.on('ConfigWindow:ChooseRimeHomeDir', event => {
        let rimeHomeDir = dialog.showOpenDialogSync(configWindow, {
            properties: ['openDirectory'] // 选择文件夹
        })
        if (rimeHomeDir) {
            configWindow.send('ConfigWindow:ChosenRimeHomeDir', rimeHomeDir)
        }
    })

    // 选取输入法程序目录
    ipcMain.on('ConfigWindow:ChooseRimeExecDir', event => {
        let rimeExecDir = dialog.showOpenDialogSync(configWindow, {
            properties: ['openDirectory'] // 选择文件夹
        })
        if (rimeExecDir && rimeExecDir[0]) {
            const normalized = normalizeConfiguredExecDir(rimeExecDir[0])
            if (normalized) {
                configWindow.send('ConfigWindow:ChosenRimeExecDir', [normalized])
            } else {
                configWindow.send('ConfigWindow:ChosenRimeExecDir:Invalid', '所选目录中未找到 WeaselDeployer.exe')
            }
        }
    })

    ipcMain.on('ConfigWindow:ResolveRimeExecDir', event => {
        const config = readConfigFile()
        const resolved = getRimeExecDir(os.platform(), config && config.rimeExecDir)
        configWindow.send('ConfigWindow:ResolvedRimeExecDir', {
            configured: (config && config.rimeExecDir) || '',
            resolved: resolved || '',
        })
    })

    // 选取编码字典文件
    ipcMain.on('ConfigWindow:SetDictMapFile', event => {
        // 获取文件码表文件路径，返回值为路径数组
        let dictMapPathArray = dialog.showOpenDialogSync(configWindow, {
            defaultPath: getRimeConfigDir(), // 默认为 Rime 配置文件目录
            filters: [
                {name: '码表文件', extensions: ['text', 'txt', 'yaml']},
            ],
            properties: ['openFile'] // 选择文件夹
        })
        if (dictMapPathArray && dictMapPathArray.length > 0) {
            let filePath = dictMapPathArray[0]
            let fileName = path.basename(filePath) // 获取文件名
            let fileContent = readFileFromDisk(filePath)
            if (fileContent) {
                configWindow.send('ConfigWindow:ShowDictMapContent', fileName, filePath, fileContent)
            } else {
                log('读取码表字典文件错误')
            }
        }
    })

    // 保存 DictMap 文件
    ipcMain.on('ConfigWindow:SaveDictMapFile', (event, fileContentString) => {
        let configPath = getAppConfigDir()
        console.log(configPath)
        fs.writeFile(
            path.join(configPath, CONFIG_DICT_MAP_FILE_NAME),
            fileContentString,
            {encoding: 'utf-8'},
            err => {
                if (err) {
                    console.log(err)
                } else {
                    configWindow.send('ConfigWindow:SaveDictMapSuccess')
                }
            })
    })
}


// config 文件保存在 用户文件夹下 / CONFIG_FILE_PATH/CONFIG_FILE_NAME 文件中
function writeConfigFile(contentString) {
    let configPath = getAppConfigDir()
    fs.writeFile(
        path.join(configPath, CONFIG_FILE_NAME),
        contentString, {encoding: 'utf-8'},
        err => {
            if (err) {
                console.log(err)
            } else {
                // 配置保存成功后，向主窗口发送配置文件内容
                if (toolWindow) toolWindow.send('ToolWindow:ResponseConfigFile', JSON.parse(contentString)) // 向窗口发送 config 内容
                if (mainWindow) mainWindow.send('MainWindow:ResponseConfigFile', JSON.parse(contentString)) // 向窗口发送 config 内容
            }
        })
}

function readConfigFile() {
    let configPath = path.join(os.homedir(), CONFIG_FILE_PATH)
    try { // 捕获读取文件时的错误，如果有配置文件 返回其内容，如果没有，返回  false
        let result = fs.readFileSync(path.join(configPath, CONFIG_FILE_NAME), {encoding: 'utf-8'})
        return JSON.parse(result)
    } catch (err) {
        return DEFAULT_CONFIG
    }
}

app.on('ready', () => {
    createMainWindow()
    getDictFileList() // 读取目录中的所有码表文件
    createMenu() // 创建菜单

    // Register a 'CommandOrControl+i' shortcut listener.
    const ret = globalShortcut.register('CommandOrControl+Shift+Alt+I', () => {
        console.log('ctrl + shift + alt + i is pressed')
        mainWindow.show()
    })

    // FOR YG777
    // Register a shortcut listener.
    // const retF3 = globalShortcut.register('F3', () => {
    //     console.log('key F3 is pressed')
    //     mainWindow.show()
    // })

    // // Register a shortcut listener.
    const retF9 = globalShortcut.register('F9', () => {
        console.log('key F9 is pressed')
        mainWindow.show()
    })

    if (!ret) {
        console.log('registration failed')
    }

    // Check whether a shortcut is registered.
    console.log(globalShortcut.isRegistered('CommandOrControl+Shift+Alt+I'))

})


app.on('will-quit', () => {
    // Unregister a shortcut.
    globalShortcut.unregister('CommandOrControl+Shift+Alt+I')

    // Unregister all shortcuts.
    globalShortcut.unregisterAll()
})

app.on('window-all-closed', function () {
    // if (process.platform !== 'darwin') app.quit()
    app.quit()
})

app.on('activate', function () {
    if (mainWindow === null) {
        createMainWindow()
    }
})

// 读取文件 从配置文件目录
function readFileFromConfigDir(fileName, responseWindow) {
    let rimeHomeDir = getRimeConfigDir()
    let filePath = path.join(rimeHomeDir, fileName)
    fs.readFile(filePath, {encoding: 'utf-8'}, (err, res) => {
        if (err) {
            console.log(err)
        } else {
            if (responseWindow) {
                responseWindow.send('showFileContent', fileName, filePath, res)
            } else {
                mainWindow.webContents.send('showFileContent', fileName, filePath, res)
            }
        }
    })
}


// 匹配文件名，返回对应文件的名字
function getLabelNameFromFileName(fileName) {
    let map = [
        {name: 'iOS仓', path: 'wubi86_jidian_user_hamster.dict.yaml'},
        {name: '❤ 用户词库', path: 'wubi86_jidian_user.dict.yaml'},
        {name: '分类词库', path: 'wubi86_jidian_extra.dict.yaml'},
        {name: '极点主表', path: 'wubi86_jidian.dict.yaml'},
        {name: 'pīnyīn 词库', path: 'pinyin_simp.dict.yaml'},
        {name: '英文', path: 'wubi86_jidian_english.dict.yaml'},
        {name: '扩展-行政区域', path: 'wubi86_jidian_extra_district.dict.yaml'},

        // 测试词库
        {name: '测试 - 主表 ⛳', path: 'test_main.dict.yaml'},
        {name: '测试 - 分组 ⛳', path: 'test_group.dict.yaml'},
        {name: '测试 - 普通 ⛳', path: 'test.dict.yaml'},
    ]
    let matchedPath = map.filter(item => item.path === fileName)
    // 返回匹配的名字，或者返回原文件名
    return matchedPath.length > 0 ? matchedPath[0].name : fileName.substring(0, fileName.indexOf('.dict.yaml'))
}


// 创建 menu
function createMenu() {
    let menuStructure = [
        {
            label: '配置',
            submenu: [
                {
                    label: '配置',
                    click() {
                        createConfigWindow()
                    }
                },
                {
                    label: '刷新', // 刷新页面
                    click() {
                        refreshWindows()
                    }
                },
                {
                    label: '打开调试窗口',
                    click(menuItem, targetWindow) {
                        targetWindow.openDevTools()
                    }
                },
                {
                    label: '关闭调试窗口',
                    click(menuItem, targetWindow) {
                        targetWindow.closeDevTools()
                    }
                },
            ]
        },
        {
            label: '编辑',
            role: 'editMenu'
        },
        {
            label: '文件夹',
            submenu: [
                {
                    label: '打开 Rime 配置文件夹', click() {
                        shell.openPath(getRimeConfigDir())
                    }
                },
                {
                    label: '打开 Rime 程序文件夹', click() {
                        shell.openPath(getRimeExecDir())
                    }
                },
                {
                    label: '打开工具配置文件夹', click() {
                        let configDir = path.join(os.homedir(), CONFIG_FILE_PATH)
                        shell.openPath(configDir)
                    }
                },
            ]
        },
        {
            label: '码表处理工具',
            submenu: [
                {
                    label: '码表处理工具',
                    click() {
                        showToolWindow()
                    }
                },
            ]
        },
        {
            label: '关于',
            submenu: [
                {label: '最小化', role: 'minimize'},
                {label: '关于', click() { showAboutDialog() }},
                {type: 'separator'},
                {label: '退出', role: 'quit'},
            ]
        },
    ]
    if (IS_IN_DEVELOP) {
        /*        menuStructure.push(

                )*/
    }
    let menu = Menu.buildFromTemplate(menuStructure)
    Menu.setApplicationMenu(menu)
}

// 初始化 macOS / Linux GTK 原生关于面板（Windows 上 setAboutPanelOptions 无可见效果）
app.setAboutPanelOptions({
    applicationName: APP_META.displayName,
    applicationVersion: APP_META.version,
    version: APP_META.version,
    copyright: `© ${APP_META.copyrightYear} ${APP_META.authorName}`,
    credits: [
        `${APP_META.displayName} (${APP_META.appName})`,
        `版本 ${APP_META.version}`,
        `包名: ${APP_META.appName}`,
        `仓库: ${APP_META.homepage}`,
    ].join('\n'),
    authors: [APP_META.authorName],
    website: APP_META.homepage,
})

// 关于窗口：macOS 走原生面板（OS 自动处理），其他平台用 dialog.showMessageBox 自定义卡片
function showAboutDialog() {
    if (process.platform === 'darwin') {
        app.showAboutPanel()
        return
    }
    const iconPath = path.join(__dirname, 'assets/img/appIcon/appIcon.png')
    const detail = [
        `应用名称: ${APP_META.displayName}`,
        `包名: ${APP_META.appName}`,
        `产品名: ${APP_META.productName}`,
        `版本: ${APP_META.version}`,
        `作者: ${APP_META.authorName} <${APP_META.authorEmail}>`,
        `仓库: ${APP_META.homepage}`,
        `© ${APP_META.copyrightYear}`,
    ].join('\n')
    const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null
    dialog.showMessageBox(win, {
        type: 'info',
        title: '关于',
        message: APP_META.displayName,
        detail,
        buttons: ['确定'],
        defaultId: 0,
        icon: fs.existsSync(iconPath) ? iconPath : undefined,
    })
}

// 刷新所有窗口内容
function refreshWindows() {
    if (mainWindow) mainWindow.reload()
    if (configWindow) configWindow.reload()
    if (toolWindow) toolWindow.reload()
}

// 读取配置目录中的所有码表文件
function getDictFileList() {
    let rimeFolderPath = getRimeConfigDir()
    fs.readdir(rimeFolderPath, (err, filePaths) => {
        if (err) {
            console.log(err)
        } else {
            let filesMenu = []
            // 筛选 .yaml 文件
            let yamlFileList = filePaths.filter(item => item.indexOf('.dict.yaml') > 0)
            // 匹配获取上面提前定义的文件名
            fileList = yamlFileList.map(item => {
                return {
                    name: getLabelNameFromFileName(item),
                    path: item
                }
            })
            // 排序路径
            fileList.sort((a, b) => a.name > b.name ? 1 : -1)
        }
    })
}

// 通知前端重载 rime 数据
// fcitx5-rime 不能用 fcitx5-remote -r（那只是 reload fcitx5 配置，不重载 rime 数据）
// 真正能强制 rime 重新读 build/*.bin 的方式：SetSchema 切走再切回
// ibus restart / fcitx4-remote -r 则可以直接重载
function reloadRimeFrontend(deployer) {
    if (deployer.reloadStrategy === 'dbus-schema-switch') {
        // fcitx5：用 gdbus 调 org.fcitx.Fcitx.Rime1.SetSchema
        const fall = deployer.fallbackSchema
        const back = deployer.deploySchema
        if (!fall || !back) {
            console.log('reload: 缺少 schema 名配置，跳过 DBus 切换')
            return
        }
        // gdbus call 同步执行；gdbus 不在 PATH 上时降级到 dbus-send
        const gdbusOrSend = commandExists('gdbus') ? 'gdbus' : 'dbus-send'
        // 1) 切到 fallback schema
        exec(`${gdbusOrSend} ${gdbusOrSend === 'gdbus' ? 'call' : ''} --session --dest org.fcitx.Fcitx5 --object-path /rime --method org.fcitx.Fcitx.Rime1.SetSchema ${fall}`.trim(),
            (err1) => {
                if (err1) {
                    console.log(`切到 ${fall} 失败:`, err1.message)
                    return
                }
                // 2) 等待 1 秒
                setTimeout(() => {
                    // 3) 切回原 schema（这会触发 rime 重新读 build/*.bin）
                    exec(`${gdbusOrSend} ${gdbusOrSend === 'gdbus' ? 'call' : ''} --session --dest org.fcitx.Fcitx5 --object-path /rime --method org.fcitx.Fcitx.Rime1.SetSchema ${back}`.trim(),
                        (err2) => {
                            if (err2) {
                                console.log(`切回 ${back} 失败:`, err2.message)
                            } else {
                                console.log(`fcitx5 rime schema 切换 ${fall} → ${back} 完成，rime 已重载`)
                            }
                        })
                }, 1000)
            })
        return
    }
    if (deployer.reloadStrategy === 'command' && deployer.reloadCmd) {
        // ibus / fcitx4
        exec(`"${deployer.reloadCmd}" ${deployer.reloadArgs.join(' ')}`, (reloadErr) => {
            if (reloadErr) {
                console.log(`${deployer.reloadCmd} 重载失败（可忽略）:`, reloadErr.message)
            }
        })
        return
    }
    // 旧版描述符（无 reloadStrategy 字段）：兼容路径
    if (deployer.reloadCmd) {
        exec(`"${deployer.reloadCmd}" ${deployer.reloadArgs.join(' ')}`, (reloadErr) => {
            if (reloadErr) {
                console.log(`${deployer.reloadCmd} 重载失败（可忽略）:`, reloadErr.message)
            }
        })
    }
}

function commandExists(cmd) {
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

// 部署 Rime
function applyRime() {
    const config = readConfigFile()
    const rimeBinDir = getRimeExecDir(os.platform(), config && config.rimeExecDir)
    if (!rimeBinDir) {
        const message = os.platform() === 'win32'
            ? '未找到 WeaselDeployer.exe，请在设置中指定输入法程序目录'
            : os.platform() === 'linux'
                ? '未检测到 rime_deployer（请安装 librime 或 fcitx5-rime / ibus-rime）'
                : '未找到输入法部署程序'
        console.log(message)
        return { success: false, message }
    }

    switch (os.platform()) {
        case 'darwin': {
            const squirrelPath = path.join(rimeBinDir, 'Squirrel')
            exec(`"${squirrelPath}" --reload`, error => {
                if (error) {
                    console.log(error)
                }
            })
            return { success: true, message: '已触发部署', execDir: rimeBinDir }
        }
        case 'win32': {
            const execFilePath = path.join(rimeBinDir, WEASEL_DEPLOYER)
            console.log(execFilePath)
            exec(`"${execFilePath}" /deploy`, err => {
                if (err) {
                    console.log(err)
                }
            })
            return { success: true, message: '已触发部署', execDir: rimeBinDir }
        }
        case 'linux': {
            // rimeBinDir 在 Linux 下是 deployer 描述符
            const deployer = rimeBinDir
            // 数据目录用 apply 时用户配置的 rimeHomeDir（如果有），否则用探测到的默认
            const dataDir = (config && config.rimeHomeDir) || deployer.dataDir
            if (!dataDir || !fs.existsSync(dataDir)) {
                return { success: false, message: `Rime 配置目录不存在: ${dataDir}` }
            }

            // Rime 共享数据目录：显式指定才能跨发行版稳定编译（Arch/Manjaro 默认共享目录为空）
            const SHARED_DATA_DIRS = [
                '/usr/share/rime-data',            // fcitx5-rime / ibus-rime 通用安装路径
                '/usr/share/rime',                 // 部分旧版发行版
            ]
            const sharedDataDir = SHARED_DATA_DIRS.find(dir => fs.existsSync(dir)) || ''
            const stagingDir = path.join(dataDir, 'build')

            // 1) rime_deployer --build <dataDir> [sharedDataDir] [stagingDir] 把 yaml 同步成 .bin
            const buildArgs = [`"${deployer.deployCmd}"`, '--build', `"${dataDir}"`]
            if (sharedDataDir) buildArgs.push(`"${sharedDataDir}"`)
            buildArgs.push(`"${stagingDir}"`)
            const buildCmd = buildArgs.join(' ')
            console.log('执行部署命令:', buildCmd)

            exec(buildCmd, (buildErr, buildStdout, buildStderr) => {
                if (buildErr) {
                    console.log('rime_deployer 失败:', buildErr.message, buildStderr)
                    return
                }
                console.log('rime_deployer 输出:', buildStdout)
                // 2) 通知前端重载 rime 数据
                reloadRimeFrontend(deployer)
            })
            return {
                success: true,
                message: `已触发 ${deployer.frontend} 部署`,
                execDir: dataDir,
            }
        }
        default:
            return { success: false, message: '当前系统不支持自动部署' }
    }
}

// 根据系统返回 rime 配置路径
function getRimeConfigDir() {
    let userHome = os.homedir()
    let config = readConfigFile()
    if (!config.rimeHomeDir) { // 没有设置配置文件目录时
        switch (os.platform()) {
            case 'aix':
                break
            case 'darwin':
                return path.join(userHome + '/Library/Rime') // macOS
            case 'freebsd':
                break
            case 'linux':
                return detectLinuxRimeConfigDir(userHome)
            case 'openbsd':
                break
            case 'sunos':
                break
            case 'win32':
                return path.join(userHome + '/AppData/Roaming/Rime') // windows
        }
    } else {
        return config.rimeHomeDir
    }
}

// Linux 下探测系统中实际使用的 Rime 前端配置目录
// 探测顺序：fcitx5（Deepin/Ubuntu 现代默认）→ ibus → fcitx4
// 已配置的用户路径优先级最高（getRimeConfigDir 中已处理）；此函数仅在「未设置」时被调用
function detectLinuxRimeConfigDir(userHome) {
    const candidates = [
        path.join(userHome, '.local', 'share', 'fcitx5', 'rime'),   // fcitx5-rime（Deepin/Ubuntu 新版）
        path.join(userHome, '.config', 'ibus', 'rime'),              // ibus-rime
        path.join(userHome, '.config', 'fcitx', 'rime'),             // fcitx4-rime
    ]
    for (const dir of candidates) {
        try {
            // 目录存在即视为命中（即便为空也合理；用户可能刚装好 Rime）
            if (fs.statSync(dir).isDirectory()) return dir
        } catch (_) {
            // 不存在则继续探测下一个
        }
    }
    // 都没探测到时回退到 fcitx5 路径（现代 Linux 桌面最常见；不命中时与 ibus-rime 一样会显示空文件列表）
    return candidates[0]
}

function getAppConfigDir() {
    return path.join(os.homedir(), CONFIG_FILE_PATH)
}

