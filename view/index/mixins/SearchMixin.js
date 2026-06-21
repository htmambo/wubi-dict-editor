// SearchMixin — auto-extracted from view/index/App.js
// 所有方法保持原 this 上下文；通过 mixins: [...] 注入到根 Vue 实例
const {
    // 视 mixin 实际使用而定
} = require('../../../js/Utility')

module.exports = {
    methods: {
        applyRime(){
            ipcRenderer.send('MainWindow:ApplyRime')
        },
        // 工具面板展开
        toolPanelExpand(){
            this.config.isToolPanelShowing = true
            ipcRenderer.send('saveConfigFileFromMainWindow', JSON.stringify(this.config))
        },
        // 工具面板关闭
        toolPanelClose(){
            this.config.isToolPanelShowing = false
            ipcRenderer.send('saveConfigFileFromMainWindow', JSON.stringify(this.config))
        },
        // 切换码表文件
        switchToFile(file){
            ipcRenderer.send('MainWindow:LoadFile', file.path)
        },

        // 确定编辑词条
        confirmEditWord(){
            this.wordEditing = null
            if(this.config.autoDeployOnEdit) this.saveToFile(this.dict) // 根据配置，是否在编辑后保存码表文件
        },
        // 生成编辑词条的编码
        generateCodeForWordEdit(){
            if (this.wordEditing){
                this.wordEditing.code = this.dictMap.decodeWord(this.wordEditing.word)
            } else {
                shakeDomFocus(this.$refs.editInputWord)
            }
        },
        // 编辑词条
        editWord(word){
            this.wordEditing = word
        },

        // 当前列表中用于 Shift 连选的词条数组
        getWordListForSelect(groupIndex){
            if (!this.dict.isGroupMode) {
                return this.words
            }
            if (this.activeGroupId !== -1) {
                return this.words[0]?.dict || []
            }
            if (groupIndex >= 0 && this.words[groupIndex]) {
                return this.words[groupIndex].dict
            }
            return []
        },
        // 选择操作
        onWordMouseDown(event){
            if (event.shiftKey) {
                event.preventDefault()
            }
        },
        select(groupIndex, index, wordId, event){
            const wordList = this.getWordListForSelect(groupIndex)
            if (event.shiftKey){
                if (this.lastChosenWordIndex !== null && this.lastChosenGroupIndex === groupIndex){
                    let a, b
                    if (index > this.lastChosenWordIndex){
                        a = this.lastChosenWordIndex
                        b = index
                    } else {
                        b = this.lastChosenWordIndex
                        a = index
                    }
                    for (let i = a; i <= b; i++){
                        if (wordList[i]) {
                            this.chosenWordIds.add(wordList[i].id)
                        }
                    }
                } else {
                    this.showTip('请先在当前分组内点击一条词条，再按住 Shift 连选')
                }
                this.lastChosenWordIndex = null
                this.lastChosenGroupIndex = null

            } else {
                if (this.chosenWordIds.has(wordId)){
                    this.chosenWordIds.delete(wordId)
                    this.lastChosenWordIndex = null
                    this.lastChosenGroupIndex = null
                } else {
                    this.chosenWordIds.add(wordId)
                    this.lastChosenWordIndex = index
                    this.lastChosenGroupIndex = groupIndex
                }
            }
            this.chosenWordIdArray = [...this.chosenWordIds.values()]
        },
        // 选择移动到的分组 index
        setDropdownActiveGroupIndex(index){
            this.dropdownActiveGroupIndex = index
        },
        // 选择移动到的文件 index
        setDropdownActiveIndex(fileIndex){
            this.dropdownActiveFileIndex = fileIndex
            this.dropdownActiveGroupIndex = -1 // 切换文件列表时，复位分组 fileIndex
            // this.dictSecond = {} // 立即清空次码表，分组列表也会立即消失，不会等下面的码表加载完成再清空
            ipcRenderer.send('MainWindow:LoadSecondDict', this.dropdownFileList[fileIndex].path) // 载入当前 index 的文件内容
        },
        addPriority(){
            this.dict.addCommonPriority()
        },
        generateSqlFile(){
            let sqlArray = this.dict.wordsOrigin.map(word => {
                let timeNow = dateFormatter(new Date())
                return `INSERT into wubi_words(word, code, priority, date_create, comment, user_init, user_modify, category_id)
                    VALUES(
                        '${word.word}','${word.code}',${word.priority || 0},'${timeNow}','${word.note}', 3, 3, 1);`
            })
            ipcRenderer.send('saveFile', 'sql.sql', sqlArray.join('\n'))
        },
        sort(){
            this.dict.sort(this.activeGroupId)
            this.refreshShowingWords()
        },
        enterKeyPressed(){
            switch (this.config.enterKeyBehavior){
                case "add":this.addNewWord(); break;
                case "search": this.search(); break;
                default: break;
            }
        },
        // 通过 code, word 筛选词条
        search(){
            this.chosenWordIds.clear()
            this.chosenWordIdArray = []
            this.activeGroupId = -1 // 切到【全部】标签页，展示所有搜索结果
            let startPoint = new Date().getTime()
            if (this.code || this.word){
                if (this.dict.isGroupMode){
                    this.words = this.dict.wordsOrigin
                        .map(groupItem => this.buildSearchGroupView(groupItem, this.code, this.word))
                        .filter(Boolean)
                    console.log('用时: ', new Date().getTime() - startPoint, 'ms')
                } else {
                    this.words = this.dict.wordsOrigin.filter(item => this.matchesSearch(item, this.code, this.word))
                    console.log(`${this.code} ${this.word}: ` ,'搜索出', this.words.length, '条，', '用时: ', new Date().getTime() - startPoint, 'ms')
                }

            } else { // 如果 code, word 为空，恢复原有数据
                this.refreshShowingWords()
            }
        },

        // 查重
        checkRepetition(includeCharacter, isWithAllRepeatWord, isWithAllType){
            this.setGroupId(-1) // 高亮分组定位到 【全部】
            this.words = this.dict.getRepetitionWords(includeCharacter, isWithAllRepeatWord, isWithAllType)
        },

        // 查询所有与单字重复的词条
        checkRepeatedWordWithSameCode(){
            this.words = this.dict.getRepeatedWordsWithSameCode()
        },

        // 词组编码查错
        getErrorWords(){
            let errorWords = []
            if(this.dict.isGroupMode){
                // 分组模式时
                this.dict.wordsOrigin.forEach(wordGroup => {
                    wordGroup.dict.forEach(item => {
                        item.indicator = wordGroup.groupName
                        if (getUnicodeStringLength(item.word) > 1 && !/[a-zA-Z0-9]+/.test(item.word)) { // 只判断词条，不判断单字
                            // TODO: 字为 unicode 时，字符长度为 2
                            if (item.code !== this.dictMap.decodeWord(item.word)) {
                                errorWords.push(item)
                            }
                        }
                    })
                })
            } else {
                // 非分组模式时
                this.dict.wordsOrigin.forEach(item => {
                    if (getUnicodeStringLength(item.word) > 1 && !/[a-zA-Z0-9]+/.test(item.word)) { // 只判断词条，不判断单字
                        if (item.code !== this.dictMap.decodeWord(item.word)) {
                            errorWords.push(item)
                        }
                    }
                })
            }
            let errorWordOrigin = []
            if (this.dict.isGroupMode){
                // 当是分组模式时，返回一个新的分组，不然无法显示正常
                errorWordOrigin.push(new WordGroup(888, '编码可能错误的词条', errorWords))
            } else {
                errorWordOrigin = errorWords
            }
            this.words = errorWordOrigin
        },


        // 单字编码查错
        getErrorWordsSingle(){
            let errorWords = []
            if(this.dict.isGroupMode){
                // 分组模式时
                this.dict.wordsOrigin.forEach(wordGroup => {
                    wordGroup.dict.forEach(item => {
                        item.indicator = wordGroup.groupName
                        if (getUnicodeStringLength(item.word) === 1) {
                            if (item.code !== this.dictMap.decodeWordSingle(`${item.word}-${item.code.length}`)) {
                                errorWords.push(item)
                            }
                        }
                    })
                })
            } else {
                // 非分组模式时
                this.dict.wordsOrigin.forEach(item => {
                    if (getUnicodeStringLength(item.word) === 1) {
                        if (item.code !== this.dictMap.decodeWordSingle(`${item.word}-${item.code.length}`)) {
                            errorWords.push(item)
                        }
                    }
                })
            }
            let errorWordOrigin = []
            if (this.dict.isGroupMode){
                // 当是分组模式时，返回一个新的分组，不然无法显示正常
                errorWordOrigin.push(new WordGroup(888, '编码可能错误的词条', errorWords))
            } else {
                errorWordOrigin = errorWords
            }
            this.words = errorWordOrigin
        },


        // 选中词条纠错
        correctErrorWords(){
            let timeStart = new Date().getTime()
            let correctionCount = 0
            let errorCount = 0
            this.chosenWordIds.forEach(id => {
                if (this.dict.isGroupMode){
                    // 分组模式时
                    this.words.forEach(wordGroup => {
                        wordGroup.dict.forEach(item => {
                            if (item.id === id){
                                if (getUnicodeStringLength(item.word) === 1){ // 单字时
                                    let correctCode = this.dictMap.decodeWordSingle(`${item.word}-${item.code.length}`)
                                    if (correctCode){
                                        item.setCode(correctCode)
                                        correctionCount = correctionCount + 1
                                    } else {
                                        item.setCode('orz')
                                        errorCount = errorCount + 1
                                    }
                                } else {
                                    let correctCode = this.dictMap.decodeWord(item.word)
                                    if (correctCode){
                                        item.setCode(correctCode)
                                        correctionCount = correctionCount + 1
                                    }
                                }
                            }
                        })
                    })
                } else {
                    // 非分组模式时
                    this.words.forEach(item => {
                        if (item.id === id){
                            if (getUnicodeStringLength(item.word) === 1){ // 单字时
                                let correctCode = this.dictMap.decodeWordSingle(`${item.word}-${item.code.length}`)
                                if (correctCode){
                                    item.setCode(correctCode)
                                    correctionCount = correctionCount + 1
                                } else {
                                    item.setCode('orz')
                                    errorCount = errorCount + 1
                                }
                            } else {
                                let correctCode = this.dictMap.decodeWord(item.word)
                                if (correctCode){
                                    item.setCode(correctCode)
                                    correctionCount = correctionCount + 1
                                }
                            }
                        }
                    })
                }
            })

            console.log(`用时：${new Date().getTime() - timeStart} ms`)
            console.log(`显示词条数为： ${this.chosenWordIds.size}，纠正：${correctionCount} 个，需要删除：${errorCount} 个`)
        },

    },
}
