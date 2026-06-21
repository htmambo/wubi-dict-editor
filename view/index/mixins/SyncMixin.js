// SyncMixin — auto-extracted from view/index/App.js
// 所有方法保持原 this 上下文；通过 mixins: [...] 注入到根 Vue 实例
const {
    // 视 mixin 实际使用而定
} = require('../../../js/Utility')

module.exports = {
    methods: {
        moveWordsToTargetDict(){
            let wordsTransferring = this.getSelectedWords()
            console.log('words transferring：', JSON.stringify(wordsTransferring))

            if (this.dict.fileName === this.targetDict.fileName){ // 如果是同词库移动
                // 同文件内移动时，必须直接操作当前 dict，避免 targetDict 与当前内存状态不一致导致“删不掉又新增”。
                this.dict.deleteWords(this.chosenWordIds, true) // 删除移动的词条
                this.dict.addWordsInOrder(wordsTransferring, this.dropdownActiveGroupIndex)
                console.log('after insert:( main:wordOrigin ):\n ', JSON.stringify(this.dict.wordsOrigin))
                this.saveToFile(this.dict)
                this.reloadCurrentDict()
            } else {
                this.targetDict.addWordsInOrder(wordsTransferring, this.dropdownActiveGroupIndex)
                this.words = [...this.dict.wordsOrigin]
                console.log('after insert:( main:wordOrigin ):\n ', JSON.stringify(this.targetDict.wordsOrigin))
                this.deleteWords() // 删除当前词库已移动的词条
                this.saveToFile(this.targetDict)
                this.saveToFile(this.dict)
            }
            this.showTip('移动成功')
            this.resetDropList()
        },
        // 复制 dropdown
        resetDropList(){
            this.isShowDropdown = false
            this.dropdownActiveFileIndex = -1
            this.dropdownActiveGroupIndex = -1
            this.targetDict = {} // 清空次码表
        },
        // 打开当前码表源文件
        openCurrentYaml(){
            ipcRenderer.send('openFileOutside', this.dict.fileName)
        },
        // 重新载入当前码表
        reloadCurrentDict(){
            ipcRenderer.send('loadDictFile', this.dict.fileName)
        },

        // 导出选中词条到 plist 文件
        exportSelectionToPlist(){
            ipcRenderer.send('MainWindow:ExportSelectionToPlistFile', this.getSelectedWords())
        },

       /*
        *
        * 同步功能过程：
        * 1. 先获取线上已存在的当前文件名的内容
        * 2-1. 如果有，获取并对比本地码表内容，增量合成一个新的
        * 2-2. 如果没有，直接上传当前的本地内容
        * 3. 上传新的词库内容
        *
        */

        // 同步功能开始
        //
        syncCurrentDict(){
            if (this.config.hasOwnProperty('userInfo')){
                // 获取线上已存在的码表数据
                ipcRenderer.send(
                    'MainWindow:sync.get:INCREASE',
                    {
                        fileName: this.dict.fileName,
                        userInfo: this.config.userInfo
                    }
                )
                console.log('MainWindow:sync.get:INCREASE')
            } else {
                this.showTip('未登录，请先前往配置页面登录')
            }
        },

        // 上传当前词库内容
        syncUploadCurrentDict(){
            if (this.config.hasOwnProperty('userInfo')){
                this.sendDictYamlForSync()
                console.log('MainWindow:sync.save')
            } else {
                this.showTip('未登录，请先前往配置页面登录')
            }
        },

        // 下载当前词库名的内容，【 覆盖 】 本地词库
        syncDownloadCurrentDict(){
            if (this.config.hasOwnProperty('userInfo')){
                ipcRenderer.send(
                    'MainWindow:sync.get:OVERWRITE',
                    {
                        fileName: this.dict.fileName,
                        userInfo: this.config.userInfo
                    }
                )
                console.log('MainWindow:sync.get:OVERWRITE')
            } else {
                this.showTip('未登录，请先前往配置页面登录')
            }
        },

        // 同步词库内容
        syncDictWords(){
            // 原来的词条数量
            let originWordCount = this.dict.countDictOrigin

            if (this.dict.isGroupMode){ // 分组模式时
                // DictMap
                let wordGroupMap = new Map()
                this.dict.wordsOrigin.forEach(group => {
                    wordGroupMap.set(group.groupName, group)
                })

                this.dictSync.wordsOrigin.forEach(syncWordGroup => {
                    if (wordGroupMap.has(syncWordGroup.groupName)){
                        // 1. 获取当前对应的 wordGroup
                        let originWordGroup = wordGroupMap.get(syncWordGroup.groupName)
                        // 2. 新建一个 OriginWordGroup.dict 的 map，用于确定是否存在相同词条
                        let originWordMap = new Map()
                        originWordGroup.dict.forEach(word => {
                            originWordMap.set(word.word + word.code, word) // 将 word+code 作为 map 的 key，不然会有遗漏的
                        })
                        // 3. 对比词条内容
                        syncWordGroup.dict.forEach(syncWord => {
                            if (originWordMap.has(syncWord.word + syncWord.code)){ // 存在词条相同
                                let wordOrigin = originWordMap.get(syncWord.word + syncWord.code)
                                if (syncWord.isContentEqualTo(wordOrigin)){ // 如果两个词条编码和词条一模一样
                                    // 什么也不做
                                } else {
                                    // 添加到这个组里，用户自行去重 **
                                    this.dict.lastIndex = this.dict.lastIndex + 1
                                    syncWord.id = this.dict.lastIndex
                                    originWordGroup.dict.push(syncWord)
                                }
                            } else {
                                this.dict.lastIndex = this.dict.lastIndex + 1
                                syncWord.id = this.dict.lastIndex
                                originWordGroup.dict.push(syncWord)
                            }
                        })
                    } else {
                        // 如果没有相同名字，直接添加
                        this.dict.lastGroupIndex = this.dict.lastGroupIndex + 1
                        let newWordGroup = new WordGroup(this.dict.lastGroupIndex, syncWordGroup.groupName, syncWordGroup.dict, false)
                        this.dict.wordsOrigin.push(newWordGroup)
                    }
                })
            } else {
                //
                // 非分组模式时
                //
                // 1. 新建一个 wordMap
                let originWordMap = new Map()
                this.dict.wordsOrigin.forEach(word => {
                    originWordMap.set(word.word + word.code, word)
                })
                // 2. 对比词条内容
                this.dictSync.wordsOrigin.forEach(syncWord => {
                    if (originWordMap.has(syncWord.word + syncWord.code)) { // 存在词条相同
                        let wordOrigin = originWordMap.get(syncWord.word + syncWord.code)
                        if (syncWord.isContentEqualTo(wordOrigin)) { // 如果两个词条编码和词条一模一样
                            // 什么也不做
                        } else {
                            // 添加到这个组里，用户自行去重 **
                            this.dict.lastIndex = this.dict.lastIndex + 1 // 更新 id, 不然 id 重复导致列表有不显示的
                            syncWord.id = this.dict.lastIndex
                            this.dict.wordsOrigin.push(syncWord)
                        }
                    } else {
                        this.dict.lastIndex = this.dict.lastIndex + 1
                        syncWord.id = this.dict.lastIndex
                        this.dict.wordsOrigin.push(syncWord)
                    }
                })
            }
            this.refreshShowingWords() // 刷新显示的词条
            let afterWordCount = this.dict.countDictOrigin
            console.log(`本地新增 ${afterWordCount - originWordCount} 条记录`)
            this.showTip(`本地新增 ${afterWordCount - originWordCount} 条记录`)
            this.sendDictYamlForSync()
            console.log('MainWindow:sync.save')
        }
    },
}
