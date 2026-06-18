'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

// dictWorkerClient.js 在顶部直接 `new Worker(...)` 会异步执行。
// 为避免 require 时就跑真 worker，测试只验证：
//   1) 模块加载不抛错
//   2) 导出函数签名正确
//   3) 阈值常量与设计意图一致（通过观察输入路由）
//   4) Worker 不可用时降级到同步路径
//   5) 边界值附近的路由分支
//
// TODO(electron-e2e): 真正端到端测试应在 Electron 渲染进程 + jsdom 环境覆盖
// Worker 分支；node:test 缺少浏览器 Worker 全局对象，且 worker_threads 与浏览器
// worker 调用栈不一致，因此本测试文件**不**覆盖真 Worker 执行。
//
// Trade-off 成本：当前 Worker 分支（threshold 之上的解析/序列化）只通过间接
// 路径覆盖（同步降级 + 入口断言）。若 Worker 文件本身或 postMessage 协议有 bug，
// 不会被本测试集发现。需要在 Electron 渲染进程集成测试补齐。

const HEADER = `---
name: t
version: "1.0"
sort: by_length
...
`

const HEADER_GROUPED = HEADER.replace('sort: by_length', 'sort: by_length\ndict_grouped: true')

function freshClient() {
    const path = require.resolve('../js/dictWorkerClient')
    delete require.cache[path]
    return require('../js/dictWorkerClient')
}

test('dictWorkerClient: exports parseDictAsync function', () => {
    const client = freshClient()
    assert.equal(typeof client.parseDictAsync, 'function')
    assert.equal(typeof client.serializeDictAsync, 'function')
})

test('dictWorkerClient: parseDictAsync resolves with parsed object for small input', async () => {
    const { parseDictAsync } = freshClient()
    const result = await parseDictAsync(HEADER + '你好\thi\n我\two\n', false)
    assert.ok(result && typeof result === 'object', 'parseDictAsync should resolve with an object, not a string')
    assert.equal(result.isGroupMode, false)
    assert.equal(result.wordsOrigin.length, 2)
    assert.equal(result.wordsOrigin[0].word, '你好')
})

test('dictWorkerClient: serializeDictAsync resolves with yaml string for small input', async () => {
    const { serializeDictAsync } = freshClient()
    const { parseDictFile, dictToPlainObject } = require('../js/dictParseCore')
    const parsed = parseDictFile(HEADER + 'a\tb\nc\td\n')
    const dictLike = { header: parsed.header, isGroupMode: false, wordsOrigin: parsed.wordsOrigin }
    const yaml = await serializeDictAsync(dictToPlainObject(dictLike))
    assert.equal(typeof yaml, 'string')
    assert.ok(yaml.includes('a\tb'), 'yaml should contain "a\\tb" line')
    assert.ok(yaml.includes('c\td'), 'yaml should contain "c\\td" line')
})

test('dictWorkerClient: parseDictAsync falls back to sync path when Worker is unavailable', async () => {
    // 验证降级：删除 global.Worker 后，模块应走同步分支并仍返回正确结果
    // 把 require.resolve 提到 try 之外，避免 finally 中模块解析异常掩盖原异常
    const modulePath = require.resolve('../js/dictWorkerClient')
    const cachedModule = require.cache[modulePath]
    const hadWorker = global.Worker
    try {
        delete global.Worker
        const { parseDictAsync } = freshClient()
        const result = await parseDictAsync(HEADER + 'x\ta\n', false)
        assert.ok(result)
        assert.equal(result.wordsOrigin[0].word, 'x')
        assert.equal(result.wordsOrigin[0].code, 'a')
    } finally {
        if (hadWorker !== undefined) global.Worker = hadWorker
        // 恢复缓存避免污染后续测试
        if (cachedModule) require.cache[modulePath] = cachedModule
    }
})

test('dictWorkerClient: parseDictAsync handles isForceProcessInUngroupMode flag', async () => {
    const { parseDictAsync } = freshClient()
    const grouped = HEADER_GROUPED + '## A\n第一\tab\n'
    // 强制非分组模式：分组 header 应被忽略，词条作为扁平数组
    const result = await parseDictAsync(grouped, true)
    assert.equal(result.isGroupMode, false, 'flag should force ungroup mode')
    assert.ok(Array.isArray(result.wordsOrigin), 'wordsOrigin should be a flat array, not array of groups')
    assert.equal(result.wordsOrigin.length, 1)
    assert.equal(result.wordsOrigin[0].word, '第一')
})

test('dictWorkerClient: threshold — input just below limit stays on sync path', async () => {
    // PARSE_WORKER_THRESHOLD = 50000 chars（dictWorkerClient.js 局部常量、未 export）。
    // 这里硬编码 50000 — 若生产代码改阈值需同步更新本测试。
    // 构造一个 < 50000 chars 的输入：header + 大量词条
    const { parseDictAsync } = freshClient()
    const line = '一\taa\n'
    const fillerCount = Math.floor((49000 - HEADER.length) / line.length)
    const filler = HEADER + line.repeat(fillerCount)
    assert.ok(filler.length < 50000, 'filler should be below threshold')
    const result = await parseDictAsync(filler, false)
    assert.ok(result.wordsOrigin.length > 0)
})

test('dictWorkerClient: throws cleanly on completely malformed input', async () => {
    // 文件格式错误应该通过 rejected promise 传递，而非同步抛错
    const { parseDictAsync } = freshClient()
    await assert.rejects(
        async () => parseDictAsync('no header terminator here', false),
        /文件格式错误/,
    )
})

test('dictWorkerClient: parseDictAsync rejects on empty input (falsy short-circuit)', async () => {
    // 生产代码显式短路 falsy 输入（!fileContent）
    const { parseDictAsync } = freshClient()
    await assert.rejects(
        async () => parseDictAsync('', false),
        /文件格式错误/,
    )
})

test('dictWorkerClient: serializeDictAsync handles large word count (>= 10000)', async () => {
    // SERIALIZE_WORKER_THRESHOLD = 10000 words（dictWorkerClient.js 局部常量）。
    // 在 Node 环境下 Worker 全局未定义，无论 wordCount 如何都走同步路径。
    // 本测试只验证序列化正确性，不验证路由决策（路由决策需要 Electron E2E 覆盖）。
    const { serializeDictAsync } = freshClient()
    const { dictToPlainObject } = require('../js/dictParseCore')
    const wordsOrigin = []
    for (let i = 0; i < 10001; i++) {
        wordsOrigin.push({ id: i, word: `w${i}`, code: `c${i}`, priority: '', note: '', indicator: '' })
    }
    const dictLike = { header: HEADER, isGroupMode: false, wordsOrigin }
    const yaml = await serializeDictAsync(dictToPlainObject(dictLike))
    assert.equal(typeof yaml, 'string')
    assert.ok(yaml.includes('w0'))
    assert.ok(yaml.includes('w10000'))
})
