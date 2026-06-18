const {shakeDom, shakeDomFocus, log, dateFormatter, getUnicodeStringLength} = require('../../js/Utility')
const {IS_IN_DEVELOP, BASE_URL} = require('../../js/Global')

const Dict = require('../../js/Dict')
const DictMap = require('../../js/DictMap')
const Word = require('../../js/Word')
const {parseDictAsync, serializeDictAsync} = require('../../js/dictWorkerClient')
const {prepareWordsForPinyinDictAsync, addWordsToPinyinDictInOrderAsync} = require('../../js/PinyinDictHelper')
const Vue  = require('../../node_modules/vue/dist/vue.common.prod')

const {ipcRenderer, net} = require('electron')
const VirtualScroller = require('vue-virtual-scroller')
const WordGroup = require("../../js/WordGroup");

const wubiApi = require("../../js/wubiApi")
const DictLoadMixin = require('./mixins/DictLoadMixin')
const SearchMixin = require('./mixins/SearchMixin')
const GroupOpMixin = require('./mixins/GroupOpMixin')
const PinyinMixin = require('./mixins/PinyinMixin')
const SyncMixin = require('./mixins/SyncMixin')
// 仅承载 computed 段的薄选项对象；命名显式，避免与真正 mixin 混淆
const computedOptions = require('./mixins/computed')
const { TipMixin } = require('../../js/TipMixin')

// Vue 2
const app = {
    el: '#app',
    mixins: [TipMixin, DictLoadMixin, SearchMixin, GroupOpMixin, PinyinMixin, SyncMixin, computedOptions],
    components: {
        RecycleScroller: VirtualScroller.RecycleScroller,
        DynamicScroller: VirtualScroller.DynamicScroller,
        DynamicScrollerItem: VirtualScroller.DynamicScrollerItem,
    },
    data() {
        return {
            IS_IN_DEVELOP, // 是否为开发模式，html 使用

            dict: {},  // 当前词库对象 Dict
            dictMain: {}, // 主码表 Dict
            keyword: '', // 搜索关键字

            code: '', // 编码
            word: '', // 词条
            priority: '', // 优先级
            note: '', // 备注

            // 编码重复的词条
            wordsRedundancy: [],
            isSearchbarFocused: false, // 光标是否在 searchbar input

            activeGroupId: -1, // 组 index
            keywordUnwatch: null, // keyword watch 方法的撤消方法
            labelOfSaveBtn: '保存', // 保存按钮的文本
            heightContent: 0, // content 高度
            words: [], // 显示的 words

            chosenWordIds: new Set(),
            chosenWordIdArray: [], // 对应上面的 set 内容
            lastChosenWordIndex: null, // 最后一次选中的 index
            lastChosenGroupIndex: null, // 分组模式下最后一次选中的 groupIndex


            targetDict: {}, // 要移动到的码表
            pinyinDict: null, // 拼音词库缓存
            pendingAddToPinyin: false,
            isPinyinAddBusy: false,
            pinyinAddPhase: '', // loading | preparing | inserting | saving
            isShowDropdown: false, // 显示移动词条窗口
            dropdownFileList: [
                // {name: '拼音词库', path: 'pinyin_simp.dict.yaml'}
            ],
            dropdownActiveFileIndex: -1, // 选中的
            dropdownActiveGroupIndex: -1, // 选中的分组 ID

            config: {}, // 全局配置

            dictMap: null, // main 返回的 dictMap，用于解码词条

            wordEditing: null, // 正在编辑的词条

            // 同步词库
            dictSync: null,

            // 网络相关
            categories: [],
            selectedCategoryId: 10, // 线上的 [ 通用词库 ]
            dictBackupInfo: null,  // 当前词库在线上的备份信息
            isDeleteAfterUpload: false, // 上传词条后是否在本地删除对应的词条

            isDictLoading: false,
            codeDebounceTimer: null,

        }
    },
    mounted() {
        // 为了消除奇怪的界面高度显示问题
        setTimeout(()=> {
            this.heightContent = innerHeight - 47 - 20 - 10 + 3
        }, 300)

        // 窗口显示时 WINDOWS SHOWED
        ipcRenderer.on('MainWindow:onWindowShowed', (event) => {
            this.$refs.domInputWord.focus()
        })
        // 载入主要操作码表文件
        ipcRenderer.on('showFileContent', (event, fileName, filePath, res) => {
            this.loadDictFromContent(res, fileName, filePath)
        })
        ipcRenderer.on('saveFileSuccess', () => {
            this.labelOfSaveBtn = '保存成功'
            this.$refs.domBtnSave.classList.add('btn-green')
            setTimeout(()=>{
                this.$refs.domBtnSave.classList.remove('btn-green')
                this.labelOfSaveBtn = '保存'
            }, 2000)
        })

        // 配置相关
        ipcRenderer.on('MainWindow:ResponseConfigFile', (event, config) => {
            this.config = config
            if (!config.hasOwnProperty('pinyinDictFileName')) {
                this.$set(this.config, 'pinyinDictFileName', 'pinyin_simp.dict.yaml')
            }
            this.activeGroupId = Number(config.chosenGroupIndex) // 首次载入时，定位到上次选中的分组
            console.log('窗口载入时获取到的 config 文件：', config)

            // request for file list
            ipcRenderer.send('GetFileList')

            // 载入配置文件之后，请求网络数据
            // network
            if (this.config.userInfo){
                this.getOnlineCategories()
            }
            this.checkFileBackupExistence()
        })
        ipcRenderer.send('MainWindow:RequestConfigFile')


        // 由 window 触发获取文件目录的请求，不然无法实现适时的获取到 主进程返回的数据
        ipcRenderer.on('FileList', (event, fileList) => {
            // 此时已经存在  config 了
            if (this.config.fileNameList && this.config.fileNameList.length > 0){
                let fileNameMap = new Map()
                this.config.fileNameList.forEach(fileNamePair => {
                    fileNameMap.set(fileNamePair.path, fileNamePair.name)
                })
                this.dropdownFileList = fileList.map(fileNameListItem => {
                    return {
                        name: fileNameMap.get(fileNameListItem.path) || fileNameListItem.name,
                        path: fileNameListItem.path
                    }
                }).sort((a,b) => a.name > b.name ? 1:-1)
            } else {
                this.dropdownFileList = fileList
            }
        })

        ipcRenderer.send('loadInitDictFile')

        // 载入目标码表
        ipcRenderer.on('setTargetDict', (event, fileName, filePath, res) => {
            this.loadDictFromContent(res, fileName, filePath, false, 'targetDict')
        })

        ipcRenderer.on('MainWindow:PinyinDictLoaded', (event, fileName, filePath, res) => {
            this.loadDictFromContent(res, fileName, filePath, false, 'pinyinDict')
        })
        ipcRenderer.on('MainWindow:PinyinDictLoadError', (event, message) => {
            this.finishPinyinAdd()
            this.showTip(`载入拼音词库失败：${message}`)
        })

        // 载入主码表
        ipcRenderer.on('setMainDict', (event, filename, res) => {
            this.loadDictFromContent(res, filename, '', true, 'dictMain')
        })

        // 配置文件保存后，向主窗口更新配置文件内容
        ipcRenderer.on('updateConfigFile', (event, config) => {
            if (this.config.pinyinDictFileName !== config.pinyinDictFileName) {
                this.pinyinDict = null
            }
            this.config = config
        })

        // 获取网络请求返回的数据
        ipcRenderer.on('responseNetData', (event, data) => {
            console.log(data)
        })

        // 获取并设置字典文件
        ipcRenderer.on('setDictMap', (event, fileContent, fileName, filePath) => {
            this.dictMap = new DictMap(null, fileContent)
        })

        // 同步: 获取内容 增量
        ipcRenderer.on('MainWindow:sync.get:INCREASE:SUCCESS', (event, res) => {
            console.log(res)
            if (res.data === ''){
                this.showTip('该词库以前未同步过')
                this.sendDictYamlForSync()
                console.log('MainWindow:sync.save')
            } else {
                this.showTip('下载成功')
                this.dictSync = new Dict(res.data.content, res.data.title)
                this.syncDictWords()
                console.log(this.dictSync)
            }
        })

        // 同步: 获取内容 覆盖
        ipcRenderer.on('MainWindow:sync.get:OVERWRITE:SUCCESS', (event, res) => {
            console.log('MainWindow:sync.get:OVERWRITE:SUCCESS')
            console.log(res)
            if (res.data === ''){
                this.showTip('该词库未同步过')
            } else {
                this.showTip('下载成功')
                let filePath = this.dict.filePath
                this.dict = new Dict(res.data.content, res.data.title, this.dict.filePath)
                this.refreshShowingWords()
                console.log(this.dict)
            }
        })

        // 同步： 保存成功
        ipcRenderer.on('MainWindow:sync.save:SUCCESS', (event, res) => {
            // 更新备份状态信息
            this.checkFileBackupExistence()
            this.showTip('上传成功')
            console.log('MainWindow:sync.save:SUCCESS')
            console.log(res)
        })

        // 同步： 保存失败
        ipcRenderer.on('MainWindow:sync.save:FAIL', (event, message) => {
            this.showTip(message)
        })

        ipcRenderer.on('MainWindow:ApplyRime:Result', (event, result) => {
            if (result && result.message) {
                this.showTip(result.message, result.success ? 2000 : 4000)
            }
        })


        // INIT
        ipcRenderer.send('getDictMap')

        this.addKeyboardListener()
        onresize = ()=>{
            this.heightContent = innerHeight - 47 - 20 - 10 + 3
        }
    },
        // 当前载入的是否为 主 码表
        isInMainDict(){
            return this.dict.fileName === 'wubi86_jidian.dict.yaml'
        },
        // 文件名字列表
        fileNameListMap(){
            // [{ "name": "luna_pinyin.sogou", "path": "luna_pinyin.sogou.dict.yaml" }]
            return new Map(this.config.fileNameList.map(item => [item.path, item.name]))
        },
        groupFlatItems(){
            if (!this.dict || !this.dict.isGroupMode || !this.words || this.words.length === 0) {
                return []
            }
            const items = []
            this.words.forEach((group, groupIndex) => {
                if (!group || !group.dict) {
                    return
                }
                items.push({
                    uid: `header-${group.id}-${groupIndex}`,
                    type: 'header',
                    group,
                    groupIndex,
                })
                group.dict.forEach((item, index) => {
                    items.push({
                        uid: `word-${item.id}`,
                        type: 'word',
                        item,
                        index,
                        groupIndex,
                    })
                })
            })
            return items
        },
        pinyinAddButtonLabel(){
            if (!this.isPinyinAddBusy) {
                return '添加到拼音词库'
            }
            const labels = {
                loading: '载入拼音词库...',
                preparing: '正在转换拼音...',
                inserting: '正在插入词条...',
                saving: '正在保存...',
            }
            return labels[this.pinyinAddPhase] || '处理中...'
        },
    },
    watch: {
        code(newValue){
            this.code = newValue.replaceAll(/[^A-Za-z ]/g, '')
            if (this.codeDebounceTimer) {
                clearTimeout(this.codeDebounceTimer)
            }
            this.codeDebounceTimer = setTimeout(() => {
                this.updateWordsRedundancy(this.code)
            }, 250)
        },
        word(newValue, oldValue){
            if (/[a-z]/i.test(newValue)){
                // 当新词包含英文时， 删除 word 不改变 code
            } else {
                if (this.dictMap){
                    this.code = this.dictMap.decodeWord(newValue)
                }
            }
        },
        chosenWordIdArray(newValue){
            if (newValue.length === 0){
                this.isShowDropdown = false
            }
            console.log('已选词条id: ', JSON.stringify(newValue))
        },
        isShowDropdown(newValue){
            if (!newValue){ // 窗口关闭时，重置 index
                this.resetDropList()
            }
        },
        'config.pinyinDictFileName'(){
            this.pinyinDict = null
        },
        config: (newValue) => {
            switch (newValue.theme){
                case "auto":
                    document.documentElement.classList.add('theme-auto');
                    document.documentElement.classList.remove('theme-dark');
                    document.documentElement.classList.remove('theme-white');
                    break;
                case "black":
                    document.documentElement.classList.remove('theme-auto');
                    document.documentElement.classList.add('theme-dark');
                    document.documentElement.classList.remove('theme-white');
                    break;
                case "white":
                    document.documentElement.classList.remove('theme-auto');
                    document.documentElement.classList.remove('theme-dark');
                    document.documentElement.classList.add('theme-white');
                    break;
            }
        }
    }
}

// 先导出 options 对象，便于测试环境 require；即使 mount 抛错也不影响模块导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = app
}

// 仅在浏览器渲染进程（document 存在 + 目标元素存在）执行挂载
if (typeof document !== 'undefined' && document.getElementById('app')) {
    new Vue(app)
}
