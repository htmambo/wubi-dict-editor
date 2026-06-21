// PinyinMixin — extracted from GroupOpMixin.js (P3+)
// 包含选中词条 → 拼音词库的完整业务：状态管理 + 异步转换 + 插入 + 保存
//
// ⚠️ 强依赖（运行时通过 this 调用，必须在 mixins 数组中排在 PinyinMixin 之前）：
//   - GroupOpMixin: this.getSelectedWords(), this.saveToFile()
//   - TipMixin:     this.setProgressTip(), this.clearProgressTip(), this.showTip()
// 调整 App.js mixins 数组顺序会导致运行时 TypeError
const { ipcRenderer } = require('electron')
const {
    prepareWordsForPinyinDictAsync,
    addWordsToPinyinDictInOrderAsync,
} = require('../../../js/PinyinDictHelper')

const REQUIRED_DEPS = [
    ['GroupOpMixin', ['getSelectedWords', 'saveToFile']],
    ['TipMixin',     ['setProgressTip', 'clearProgressTip', 'showTip']],
]

module.exports = {
    created() {
        // 运行时检测：mixin 顺序错误时给出明确错误而非后续 TypeError
        const missing = []
        REQUIRED_DEPS.forEach(([mixinName, methods]) => {
            methods.forEach(m => {
                if (typeof this[m] !== 'function') missing.push(`${mixinName}.${m}`)
            })
        })
        if (missing.length) {
            // 非阻塞：仅打印；拼音功能将在首次调用时报 TypeError，但排查路径更短
            console.error(
                `[PinyinMixin] 缺少依赖方法: ${missing.join(', ')}。` +
                `请检查 App.js mixins 数组顺序，${REQUIRED_DEPS.map(d => d[0]).join(' / ')} 必须在 PinyinMixin 之前。`
            )
        }
    },
    methods: {
        beginPinyinAdd(phase, progressTip){
            this.isPinyinAddBusy = true
            this.pinyinAddPhase = phase
            this.setProgressTip(progressTip)
        },
        updatePinyinAddProgress(phase, progressTip){
            this.pinyinAddPhase = phase
            this.setProgressTip(progressTip)
        },
        finishPinyinAdd(){
            this.isPinyinAddBusy = false
            this.pinyinAddPhase = ''
            this.pendingAddToPinyin = false
            this.clearProgressTip()
        },
        addSelectionToPinyinDict(){
            if (this.isPinyinAddBusy) {
                return
            }
            if (!this.config.pinyinDictFileName) {
                this.showTip('请先在设置中指定拼音词库')
                return
            }
            if (this.dict.fileName === this.config.pinyinDictFileName) {
                this.showTip('拼音词库不能与当前码表相同')
                return
            }
            const wordsSelected = this.getSelectedWords()
            if (wordsSelected.length === 0) {
                return
            }
            if (this.pinyinDict && this.pinyinDict.fileName === this.config.pinyinDictFileName) {
                this.beginPinyinAdd('preparing', `正在转换拼音（0/${wordsSelected.length}）...`)
                this.applyAddToPinyinDict(wordsSelected)
                return
            }
            this.pendingAddToPinyin = true
            this.beginPinyinAdd('loading', '正在载入拼音词库...')
            ipcRenderer.send('MainWindow:LoadPinyinDict', this.config.pinyinDictFileName)
        },
        async applyAddToPinyinDict(wordsSelected){
            try {
                const { toAdd, skipped, failed } = await prepareWordsForPinyinDictAsync(
                    wordsSelected,
                    this.pinyinDict,
                    this.pinyinDict.lastIndex,
                    (current, total, message) => this.updatePinyinAddProgress('preparing', message)
                )
                if (toAdd.length === 0) {
                    this.finishPinyinAdd()
                    if (failed.length) {
                        this.showTip(`无法生成拼音：${failed.join('、')}`)
                    } else if (skipped.length) {
                        this.showTip(`词条已存在于拼音词库：${skipped.join('、')}`)
                    }
                    return
                }
                const groupIndex = this.pinyinDict.isGroupMode ? 0 : -1
                await addWordsToPinyinDictInOrderAsync(
                    this.pinyinDict,
                    toAdd,
                    groupIndex,
                    (current, total, message) => this.updatePinyinAddProgress('inserting', message)
                )
                this.updatePinyinAddProgress('saving', '正在保存拼音词库...')
                await this.saveToFile(this.pinyinDict, { updateSaveButton: false })
                this.finishPinyinAdd()
                let msg = `已添加 ${toAdd.length} 条到拼音词库`
                if (skipped.length) {
                    msg += `，跳过 ${skipped.length} 条已存在`
                }
                if (failed.length) {
                    msg += `，${failed.length} 条无法生成拼音`
                }
                this.showTip(msg)
            } catch (err) {
                console.error(err)
                this.finishPinyinAdd()
                this.showTip(`添加到拼音词库失败：${err.message}`)
            }
        },
    },
}
