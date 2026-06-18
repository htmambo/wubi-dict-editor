// computed — auto-extracted from view/index/App.js
module.exports = {
    computed: {
        // 当前显示的 words 数量
        wordsCount(){
            if (this.dict.isGroupMode){
                let countCurrent = 0
                this.words.forEach(group => {
                    countCurrent = countCurrent + group.dict.length
                })
                return countCurrent
            } else {
                return this.words.length
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
    methods: {

    },
}
