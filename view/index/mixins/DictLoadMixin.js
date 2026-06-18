// DictLoadMixin — auto-extracted from view/index/App.js
// 所有方法保持原 this 上下文；通过 mixins: [...] 注入到根 Vue 实例

module.exports = {
    methods: {
        loadDictFromContent(fileContent, fileName, filePath, isForceProcessInUngroupMode = false, targetKey = 'dict'){
            if (targetKey === 'dict') {
                this.isDictLoading = true
            }
            return parseDictAsync(fileContent, isForceProcessInUngroupMode)
                .then(parsed => {
                    const dict = Dict.fromParsed(parsed, fileName, filePath)
                    if (targetKey === 'dictMain') {
                        this.dictMain = dict
                        console.log('主码表词条数量：', this.dictMain.wordsOrigin.length)
                    } else if (targetKey === 'targetDict') {
                        this.targetDict = dict
                    } else if (targetKey === 'pinyinDict') {
                        this.pinyinDict = dict
                        if (this.pendingAddToPinyin) {
                            this.pendingAddToPinyin = false
                            const wordsSelected = this.getSelectedWords()
                            this.updatePinyinAddProgress('preparing', `正在转换拼音（0/${wordsSelected.length}）...`)
                            this.applyAddToPinyinDict(wordsSelected)
                        }
                    } else {
                        this.dict = dict
                        this.word = ''
                        this.refreshShowingWords()
                        ipcRenderer.send('loadMainDict')
                        this.checkFileBackupExistence()
                    }
                })
                .catch(err => {
                    console.error(err)
                    if (targetKey === 'pinyinDict') {
                        this.finishPinyinAdd()
                        this.showTip(`载入拼音词库失败：${err.message}`)
                    } else {
                        this.showTip(`载入失败：${err.message}`)
                    }
                })
                .finally(() => {
                    if (targetKey === 'dict') {
                        this.isDictLoading = false
                    }
                })
        },
        matchesSearch(item, code, word){
            switch (this.config.searchMethod){
                case "code": return item.code.includes(code)
                case "phrase": return item.word.includes(word)
                case "both": return item.code.includes(code) && item.word.includes(word)
                case "any": return item.code.includes(code) || item.word.includes(word)
                default: return item.code.includes(code) || item.word.includes(word)
            }
        },
        buildSearchGroupView(groupItem, code, word){
            const dict = groupItem.dict.filter(item => this.matchesSearch(item, code, word))
            if (dict.length === 0) {
                return null
            }
            return {
                id: groupItem.id,
                groupName: groupItem.groupName,
                dict,
                isEditingTitle: false,
            }
        },
        updateWordsRedundancy(code){
            const normalizedCode = code.replaceAll(/[^A-Za-z ]/g, '')
            if (!normalizedCode) {
                this.wordsRedundancy = []
                return
            }
            const wordsMainDictRedundancy = (this.dictMain?.getWordsByCode(normalizedCode) || []).map(item => {
                item.origin = this.fileNameListMap.get(this.config.mainDictFileName)
                return item
            })
            const wordsCurrentDictRedundancy = (this.dict?.getWordsByCode(normalizedCode) || []).map(item => {
                item.origin = '当前码表'
                return item
            })
            this.wordsRedundancy = wordsMainDictRedundancy.concat(wordsCurrentDictRedundancy)
        },
        // 显示 | 隐藏 移动到文件的列表
        toggleFileListDropDown(){
            if (this.isShowDropdown){
                this.isShowDropdown = false
            } else {
                // 匹配跟当前码表一致的 file Index，只在分组模式时自动选择
                if (this.dict.isGroupMode){
                    this.dropdownFileList.forEach((item, index) => {
                        if (item.path === this.dict.fileName){
                            this.dropdownActiveFileIndex = index
                            this.setDropdownActiveIndex(index)
                        }
                    })
                }
                this.isShowDropdown = true
            }
        },
        // 获取词库备份信息
        checkFileBackupExistence(){
            if (this.config.userInfo && this.config.userInfo.password && this.dict.fileName){ // config 和 当前词库内容都已经载入时才请求备份信息
                wubiApi
                    .checkDictFileBackupExistence(this.config.userInfo, {
                        fileName: this.dict.fileName
                    }, this.config.baseURL)
                    .then(res => {
                        this.dictBackupInfo = res.data
                        /* {
                            "id": 28,
                            "title": "wubi86_jidian_user.dict.yaml",
                            "content_size": 2717,
                            "word_count": 196,
                            "date_init": "2022-04-23T02:17:57.000Z",
                            "date_update": "2022-12-14T02:34:51.000Z",
                            "comment": "",
                            "uid": 3,
                            "sync_count": 2
                        }*/
                        if (this.dictBackupInfo){
                            // console.log(this.dictBackupInfo)
                            this.$set(this.dictBackupInfo,'date_init_string', dateFormatter(new Date(this.dictBackupInfo.date_init)))
                            this.$set(this.dictBackupInfo,'date_update_string', dateFormatter(new Date(this.dictBackupInfo.date_update)))
                        }

                    })
            }
        },
        // 获取线上的扩展词库分类列表
        getOnlineCategories(){
            wubiApi
                .getCategories(this.config.userInfo, this.config.baseURL)
                .then(res => {
                    this.categories = res.data
                })
        },

        // 改变上传到的类别 id
        changeSelectedCategoryId(categoryId){
            this.selectedCategoryId = categoryId
        },

        // 上传选中的词条到服务器
        uploadChosenWordsToServer(){
            let wordsSelected = [] // 被选中的 [Word]
            if (this.dict.isGroupMode){
                this.dict.wordsOrigin.forEach((group, index) => {
                    let matchedWords = group.dict.filter(item => this.chosenWordIds.has(item.id))
                    wordsSelected = wordsSelected.concat(matchedWords)
                })
            } else {
                wordsSelected = this.dict.wordsOrigin.filter(item => this.chosenWordIds.has(item.id))
            }

            wubiApi
                .uploadWordsBatch(
                    this.config.userInfo,
                    {
                        category_id: this.selectedCategoryId,
                        words: wordsSelected
                    }, this.config.baseURL)
                .then(res => {
                    let message = `添加 ${res.data.addedCount} 条`
                    if (res.data.existCount > 0){
                        message = message + `，已存在词条 ${res.data.existCount} 条`
                    }
                    // 上传成功
                    this.showTip([res.message, message])
                    if (this.isDeleteAfterUpload){
                        // 删除已经上传的词条
                        this.deleteWords()
                    }
                })
                .catch(err => {
                    this.showTip(err.message)
                })
        },

        // 下载线上扩展词库到本地
        updateExtraDict(){
            if (this.config.userInfo.password){
                console.log('config: ', this.config)
                wubiApi
                    .pullExtraDict(this.config.userInfo, this.config.baseURL)
                    .then(res => {
                        this.showTip('获取线上分类扩展词库内容成功')

                        // 使用线上的更新数据更新到当前分类扩展词库中
                        let wordGroups = []
                        let lastCategoryName = ''
                        console.log(res.data.length)
                        res.data
                            .sort((a,b) => a.category_id - b.category_id)
                            .forEach(item => {
                                if (lastCategoryName !== item.category_name) {
                                    wordGroups.push(new WordGroup(
                                        item.category_id,
                                        item.category_name,
                                        [new Word(item.id, item.code, item.word, item.priority, item.comment)]
                                    ))
                                } else {
                                    wordGroups[wordGroups.length - 1].dict.push(new Word(item.id, item.code, item.word, item.priority, item.comment))
                                }
                                lastCategoryName = item.category_name
                            })
                        this.dict.wordsOrigin = wordGroups
                        this.refreshShowingWords()
                    })
                    .catch(err => {
                        this.showTip(err.message)
                    })
            } else {
                this.showTip('未登录用户，请先前往配置页面登录')
            }
        },

        // 部署码表内容
    },
}
