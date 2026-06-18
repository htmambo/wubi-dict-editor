// GroupOpMixin — auto-extracted from view/index/App.js
// 所有方法保持原 this 上下文；通过 mixins: [...] 注入到根 Vue 实例
//
// 强依赖：PinyinMixin 通过 this.getSelectedWords / this.saveToFile 调用本文件
//         App.js mixins 数组中 PinyinMixin 必须排在 GroupOpMixin 之后

module.exports = {
    methods: {
        // GROUP OPERATION
        // 添加新组
        addGroupBeforeId(groupIndex){
            this.dict.addGroupBeforeId(groupIndex)
            this.refreshShowingWords()
        },
        deleteGroup(groupId){
            this.dict.deleteGroup(groupId)
            this.activeGroupId = - 1 // 不管删除哪个分组，之后都指向全部
            this.refreshShowingWords()
        },
        // 设置当前显示的 分组
        setGroupId(groupId){ // groupId 全部的 id 是 -1
            this.activeGroupId = Number(groupId)
            this.refreshShowingWords()
            this.config.chosenGroupIndex = groupId
            ipcRenderer.send('saveConfigFileFromMainWindow', JSON.stringify(this.config))
        },
        // 刷新 this.words
        refreshShowingWords(){
            this.chosenWordIds.clear()
            this.chosenWordIdArray = []
            this.lastChosenWordIndex = null
            this.lastChosenGroupIndex = null
            console.log('已选中的 groupIndex: ',this.activeGroupId, typeof this.activeGroupId)
            if (this.dict.isGroupMode){
                if (Number(this.activeGroupId) === -1){
                    this.words = [...this.dict.wordsOrigin]
                } else {
                    if (this.activeGroupId > this.dict.wordsOrigin.length - 1) {
                        this.activeGroupId = this.dict.wordsOrigin.length - 1
                    }
                    this.words = [this.dict.wordsOrigin[this.activeGroupId]]
                }
            } else {
                this.words = [...this.dict.wordsOrigin]
            }
        },
        addNewWord(){
            if (!this.word){
                shakeDomFocus(this.$refs.domInputWord)
            } else if (!this.code){
                shakeDomFocus(this.$refs.domInputCode)
            } else {
                this.dict.addNewWord(
                    new Word(this.dict.lastIndex, this.code, this.word, this.priority, this.note) ,
                    this.activeGroupId
                )
                this.refreshShowingWords()
                console.log(this.code, this.word, this.priority, this.note, this.activeGroupId)
                if (this.config.autoDeployOnAdd){
                    this.saveToFile(this.dict)
                }
            }
        },

        // 保存内容到文件
        saveToFile(dict, options = {}){
            const { updateSaveButton = true } = options
            console.log('save to: ', dict.fileName)
            const previousLabel = this.labelOfSaveBtn
            if (updateSaveButton) {
                this.labelOfSaveBtn = '保存中...'
            }
            return serializeDictAsync(dict)
                .then(yamlString => {
                    ipcRenderer.send('saveFile', dict.fileName, yamlString)
                })
                .catch(err => {
                    console.error(err)
                    this.showTip(`保存失败：${err.message}`)
                    if (updateSaveButton) {
                        this.labelOfSaveBtn = previousLabel
                    }
                    throw err
                })
        },
        sendDictYamlForSync(){
            return serializeDictAsync(this.dict).then(yamlString => {
                ipcRenderer.send('MainWindow:sync.save', {
                    fileName: this.dict.fileName,
                    fileContentYaml: yamlString,
                    wordCount: this.dict.countDictOrigin,
                    userInfo: this.config.userInfo
                })
            })
        },
        // 选中全部展示的词条
        selectAll(){
            if(this.wordsCount < 100000){
                if (this.dict.isGroupMode){
                    this.chosenWordIds.clear()
                    this.chosenWordIdArray = []
                    this.words.forEach(group => { // group 是 dictGroup
                        group.dict.forEach( item => {
                            this.chosenWordIds.add(item.id)
                        })
                    })
                } else {
                    this.words.forEach(item => {this.chosenWordIds.add(item.id)})
                }
                this.chosenWordIdArray = [...this.chosenWordIds.values()]
            } else {
                // 提示不能同时选择太多内容
                this.showTip('不能同时选择大于 十万 条的词条内容')
                shakeDom(this.$refs.domBtnSelectAll)
            }
        },
        // 清除内容
        resetInputs(){
            this.chosenWordIds.clear()
            this.chosenWordIdArray = []
            this.code = ''
            this.word = ''
            this.search()
            this.tips = []
        },
        // 删除词条：单
        deleteWord(wordId){
            this.chosenWordIds.delete(wordId)
            this.chosenWordIdArray = [...this.chosenWordIds.values()]
            this.dict.deleteWords(new Set([wordId]))
            this.refreshShowingWords()
            if(this.config.autoDeployOnDelete){ this.saveToFile(this.dict) }
        },
        // 删除词条：多
        deleteWords(){
            this.dict.deleteWords(this.chosenWordIds)
            this.refreshShowingWords()
            this.chosenWordIds.clear() // 清空选中 wordID
            this.chosenWordIdArray = []
            if(this.config.autoDeployOnDelete){ this.saveToFile(this.dict) }
        },

        /**
         * 词条位置移动
         * @param wordId 词条 id
         * @param direction 方向
         * @param isSwitchPriority  是否调换两个词条的 Priority
         * @returns {string}
         */
        move(wordId, direction, isSwitchPriority){
            if (this.dict.isGroupMode){
                // group 时，移动 调换 word 位置，是直接调动的 wordsOrigin 中的word
                // 因为 group 时数据为： [{word, word},{word,word}]，是 wordGroup 的索引
                for(let i=0; i<this.words.length; i++){
                    let group = this.words[i]
                    for(let j=0; j<group.dict.length; j++){
                        if (wordId === group.dict[j].id){
                            let tempItem = group.dict[j]
                            if (direction === 'up'){
                                if (j !==0){
                                    group.dict[j] = group.dict[j - 1]
                                    group.dict[j - 1] = tempItem
                                    if (isSwitchPriority){
                                        // 调换两个词的权重值
                                        let tempPriority = group.dict[j].priority
                                        group.dict[j].priority = group.dict[j - 1].priority
                                        group.dict[j - 1].priority = tempPriority
                                    }
                                    return ''
                                } else {
                                    console.log('已到顶')
                                    return '已到顶'
                                }
                            } else if (direction === 'down'){
                                if (j+1 !== group.dict.length){
                                    group.dict[j] = group.dict[j + 1]
                                    group.dict[j + 1] = tempItem
                                    if (isSwitchPriority) {
                                        // 调换两个词的权重值
                                        let tempPriority = group.dict[j].priority
                                        group.dict[j].priority = group.dict[j + 1].priority
                                        group.dict[j + 1].priority = tempPriority
                                    }
                                    return ''
                                } else {
                                    console.log('已到底')
                                    return '已到底'
                                }
                            }
                        }
                    }
                }
            } else {
                // 非分组模式时，调换位置并不能直接改变 wordsOrigin 因为 与 words 已经断开连接
                // [word, word]
                for(let i=0; i<this.words.length; i++){
                    if (wordId === this.words[i].id){
                        let tempItem = this.words[i]
                        if (direction === 'up'){
                            if (i !==0) {
                                this.dict.exchangePositionInOrigin(tempItem, this.words[i-1]) // 调换 wordsOrigin 中的词条位置
                                this.words[i] = this.words[i - 1]
                                this.words[i - 1] = tempItem
                                if (isSwitchPriority) {
                                    // 调换两个词的权重值
                                    let tempPriority = this.words[i].priority
                                    this.words[i].priority = this.words[i - 1].priority
                                    this.words[i - 1].priority = tempPriority
                                }
                                return ''
                            } else {
                                console.log('已到顶')
                                return '已到顶'
                            }
                        } else if (direction === 'down'){
                            if (i+1 !== this.words.length) {
                                this.dict.exchangePositionInOrigin(tempItem, this.words[i+1]) // 调换 wordsOrigin 中的词条位置
                                this.words[i] = this.words[i + 1]
                                this.words[i + 1] = tempItem
                                if (isSwitchPriority) {
                                    // 调换两个词的权重值
                                    let tempPriority = this.words[i].priority
                                    this.words[i].priority = this.words[i + 1].priority
                                    this.words[i + 1].priority = tempPriority
                                }
                                return ''
                            } else {
                                console.log('已到底')
                                return '已到底'
                            }
                        }
                    }
                }
            }
        },

        // 上移词条
        moveUp(id, isSwitchPriority){
            this.showTip(this.move(id, 'up', isSwitchPriority))
            let temp = this.words.pop()
            this.words.push(temp)
        },
        // 下移词条
        moveDown(id, isSwitchPriority){
            this.showTip(this.move(id, 'down', isSwitchPriority))
            let temp = this.words.pop()
            this.words.push(temp)
        },

        catalogMove(groupId, direction){
            console.log(groupId, direction)
            for (let i=0; i<this.dict.wordsOrigin.length; i++){
                if (groupId === this.dict.wordsOrigin[i].id){
                    let currentGroup = this.dict.wordsOrigin[i]
                    let tempGroup = {}
                    Object.assign(tempGroup, currentGroup)
                    switch (direction){
                        case 'up':
                            if (i === 0){
                                console.log('已到顶')
                            } else {
                                this.dict.wordsOrigin[i] = this.dict.wordsOrigin[i-1]
                                this.dict.wordsOrigin[i-1] = tempGroup
                                this.dict.wordsOrigin.push({})
                                this.dict.wordsOrigin.pop()
                            }
                            break;
                        case 'down':
                            if (i === this.dict.wordsOrigin.length - 1){
                                console.log('已到底')
                            } else {
                                this.dict.wordsOrigin[i] = this.dict.wordsOrigin[i+1]
                                this.dict.wordsOrigin[i+1] = tempGroup
                                this.dict.wordsOrigin.push({})
                                this.dict.wordsOrigin.pop()
                            }
                            break;
                    }
                    break
                }
            }
        },

        // 判断是否为第一个元素
        isFirstItem(id){
            if (this.dict.isGroupMode){ // 分组时的第一个元素
                for (let i=0; i<this.words.length; i++) {
                    for (let j = 0; j < this.words[i].dict.length; j++) {
                        if (this.words[i].dict[j].id === id){
                            return j === 0 // 使用 array.forEach() 无法跳出循环
                        }
                    }
                }
                return false
            } else {
                for (let i = 0; i < this.words.length; i++) {
                    if (this.words[i].id === id){
                        return i === 0 // 使用 array.forEach() 无法跳出循环
                    }
                }
                return false
            }
        },
        // 判断是否为最后一个元素
        isLastItem(id){
            if (this.dict.isGroupMode){ // 分组时的最后一个元素
                for (let i=0; i<this.words.length; i++) {
                    for (let j = 0; j < this.words[i].dict.length; j++) {
                        if (this.words[i].id === id){
                            return j + 1 === this.words.length
                        }
                    }
                }
                return false
            } else {
                for (let i = 0; i < this.words.length; i++) {
                    if (this.words[i].id === id){
                        return i + 1 === this.words.length
                    }
                }
                return false
            }
        },
        // 绑定键盘事件： 键盘上下控制词条上下移动
        addKeyboardListener(){
            window.addEventListener('keydown', event => {
                // console.log(event)
                switch( event.key) {
                    case 's':
                        if (event.ctrlKey || event.metaKey){ // metaKey 是 macOS 的 Ctrl
                            this.saveToFile(this.dict)
                            event.preventDefault()
                        } else {

                        }
                        break
                    case 'ArrowDown':
                        if(this.chosenWordIds.size === 1) { // 只有一个元素时，键盘才起作用
                            let id = [...this.chosenWordIds.values()][0]
                            this.moveDown(id)
                        }
                        event.preventDefault()
                        break
                    case 'ArrowUp':
                        if(this.chosenWordIds.size === 1) { // 只有一个元素时，键盘才起作用
                            let id = [...this.chosenWordIds.values()][0]
                            this.moveUp(id)
                        }
                        event.preventDefault()
                        break
                }
            })
        },
        // 将选中的词条移动到指定码表
        getSelectedWords(){
            let wordsSelected = []
            if (this.dict.isGroupMode){
                this.dict.wordsOrigin.forEach(group => {
                    wordsSelected = wordsSelected.concat(group.dict.filter(item => this.chosenWordIds.has(item.id)))
                })
            } else {
                wordsSelected = this.dict.wordsOrigin.filter(item => this.chosenWordIds.has(item.id))
            }
            return wordsSelected
        },
    },
}
