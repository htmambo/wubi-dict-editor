'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { TipMixin } = require('../js/TipMixin')

// 构造一个最小 Vue 实例上下文（不依赖 vue 库，仅用作 mixin 方法调用）
// 分阶段：先放 data，再挂 methods/computed；避免 getter 在构造期访问未初始化的 this.tips
function createHost(mixinData = {}) {
    const host = {
        ...mixinData,
        $nextTick: () => Promise.resolve(),
    }
    // 1. 先注入 data
    Object.assign(host, TipMixin.data())
    // 2. 注入 methods（this 在调用时已包含 data）
    Object.assign(host, TipMixin.methods)
    // 3. 注入 computed（getter 形式）
    for (const key of Object.keys(TipMixin.computed)) {
        Object.defineProperty(host, key, {
            get: TipMixin.computed[key],
            configurable: true,
            enumerable: true,
        })
    }
    return host
}

test('TipMixin: data() returns expected shape', () => {
    const d = TipMixin.data()
    assert.ok(Array.isArray(d.tips), 'tips should be an array')
    assert.equal(d.tipTimeoutHandler, null)
    assert.equal(typeof d.progressTip, 'string')
})

test('TipMixin: tipDisplayText joins tips when no progress', () => {
    const host = createHost()
    host.tips = [{ message: 'hello' }, { message: 'world' }]
    assert.equal(host.tipDisplayText, 'hello , world')
})

test('TipMixin: tipDisplayText prefers progressTip over queued tips', () => {
    const host = createHost()
    host.tips = [{ message: 'queued' }]
    host.progressTip = 'in progress'
    assert.equal(host.tipDisplayText, 'in progress')
})

test('TipMixin: showTip enqueues message and updates display text', () => {
    const host = createHost()
    host.showTip('one')
    host.showTip('two')
    assert.equal(host.tips.length, 2)
    assert.equal(host.tipDisplayText, 'one , two')
})

test('TipMixin: showTip accepts array and adds each entry', () => {
    const host = createHost()
    host.showTip(['a', 'b', 'c'])
    assert.equal(host.tips.length, 3)
    assert.equal(host.tipDisplayText, 'a , b , c')
})

test('TipMixin: showTip ignores null/undefined', () => {
    const host = createHost()
    host.showTip(null)
    host.showTip(undefined)
    assert.equal(host.tips.length, 0)
})

test('TipMixin: setProgressTip + clearProgressTip control progress display', () => {
    const host = createHost()
    host.setProgressTip('processing...')
    assert.equal(host.progressTip, 'processing...')
    assert.equal(host.tipDisplayText, 'processing...')
    host.clearProgressTip()
    assert.equal(host.progressTip, '')
    assert.equal(host.tipDisplayText, '')
})

// App.js 静态扫描断言：P2 拆分 App.js 时回归网
// 不 require 整个文件（依赖 electron + node_modules/vue）
const APP_JS_PATH = path.join(__dirname, '../view/index/App.js')
const appSource = fs.readFileSync(APP_JS_PATH, 'utf8')

test('App.js: exports the Vue options object via module.exports for tests', () => {
    assert.match(
        appSource,
        /module\.exports\s*=\s*app/,
        'App.js must expose its Vue options object for unit testing'
    )
})

test('App.js: mounts only when #app element exists (production-safe guard)', () => {
    assert.match(
        appSource,
        /document\.getElementById\(['"]app['"]\)/,
        'App.js must guard new Vue() with document.getElementById("#app")'
    )
})

test('App.js: preserves key data fields used by view layer', () => {
    for (const field of ['dict', 'dictMain', 'keyword', 'chosenWordIds', 'activeGroupId', 'words']) {
        assert.match(appSource, new RegExp(`\\b${field}\\b`), `App.js must keep data.${field}`)
    }
})

test('App.js + mixins: preserve key method names referenced by index.html', () => {
    // P2 拆分后方法在 mixins/ 子目录；扫描 App.js + 所有 mixin 文件
    // 这些方法名来自 view/index/index.html 的 @click 绑定，是 UI 行为契约
    const fsx = require('node:fs')
    const mixinsDir = path.join(__dirname, '../view/index/mixins')
    const combined = appSource + fsx.readdirSync(mixinsDir)
        .filter(f => f.endsWith('.js'))
        .map(f => fsx.readFileSync(path.join(mixinsDir, f), 'utf8'))
        .join('\n')
    const methodsUsedByTemplate = [
        'addGroupBeforeId',
        'changeSelectedCategoryId',
        'checkRepeatedWordWithSameCode',
        'checkRepetition',
        'deleteGroup',
        'saveToFile',
        'select',
        'setDropdownActiveGroupIndex',
        'setDropdownActiveIndex',
        'setGroupId',
        'switchToFile',
    ]
    for (const m of methodsUsedByTemplate) {
        assert.match(
            combined,
            new RegExp(`\\b${m}\\s*\\(`),
            `method ${m}() must be defined in App.js or view/index/mixins/*.js`
        )
    }
})

test('App.js: still uses TipMixin as a mixin', () => {
    // P2 拆分后 mixins 数组会扩展为 [TipMixin, ...其它 mixin]
    // 这里只断言 TipMixin 仍在数组里，不限制其它 mixin 顺序
    assert.match(appSource, /mixins:\s*\[[^\]]*TipMixin[^\]]*\]/, 'App.js must keep TipMixin in mixins array')
})

test('App.js: composes 6 extracted mixins after P2+Pinyin split', () => {
    // P2 拆分契约：App.js 必须把 methods/computed 段拆到 mixins/ 子目录下
    // 注意：computedOptions 是 computed 段的薄包装，与其它 5 个真正的 mixin 命名上区分
    for (const name of ['DictLoadMixin', 'SearchMixin', 'GroupOpMixin', 'PinyinMixin', 'SyncMixin', 'computedOptions']) {
        assert.match(
            appSource,
            new RegExp(`\\b${name}\\b`),
            `App.js must reference extracted mixin ${name}`
        )
    }
    // 同时确认原 methods/computed 段已从 App.js 移除
    const methodsSectionRegex = /^    methods:\s*\{$/m
    const computedSectionRegex = /^    computed:\s*\{$/m
    assert.equal(methodsSectionRegex.test(appSource), false, 'App.js methods: { section should be removed after P2')
    assert.equal(computedSectionRegex.test(appSource), false, 'App.js computed: { section should be removed after P2')
})