'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
    parseDictFile,
    serializeDictYaml,
    dictToPlainObject,
    wordToYamlString,
    getUnicodeStringLength,
} = require('../js/dictParseCore')

const HEADER = `---
name: test
version: "1.0"
sort: by_length
...
`

test('parseDictFile: normal mode header & metadata', () => {
    const parsed = parseDictFile(HEADER + '你好\thi\n我\two\n')
    assert.equal(parsed.isGroupMode, false)
    assert.equal(parsed.header, HEADER.replace(/\n$/, ''))
    assert.equal(parsed.wordsOrigin.length, 2)
    assert.equal(parsed.wordsOrigin[0].word, '你好')
    assert.equal(parsed.wordsOrigin[0].code, 'hi')
    assert.equal(parsed.wordsOrigin[1].code, 'wo')
})

test('parseDictFile: group mode splits on ##', () => {
    const yaml = HEADER.replace('sort: by_length', 'sort: by_length\ndict_grouped: true') + `## A
aa\ta
ab\tb

## B
ba\tc
`
    const parsed = parseDictFile(yaml)
    assert.equal(parsed.isGroupMode, true)
    assert.equal(parsed.wordsOrigin.length, 2)
    assert.equal(parsed.wordsOrigin[0].groupName, 'A')
    assert.equal(parsed.wordsOrigin[0].dict.length, 2)
    assert.equal(parsed.wordsOrigin[1].groupName, 'B')
    assert.equal(parsed.wordsOrigin[1].dict.length, 1)
})

test('parseDictFile: throws when no header terminator', () => {
    assert.throws(() => parseDictFile('hello world'), /文件格式错误/)
})

test('parseDictFile: strips \\r\\n line endings', () => {
    const parsed = parseDictFile(HEADER + '你\thi\r\n我\two\r\n')
    assert.equal(parsed.wordsOrigin.length, 2)
})

test('serializeDictYaml: round-trip normal mode preserves content', () => {
    const original = HEADER + '你好\thi\n世界\tshi jie\n'
    const parsed = parseDictFile(original)
    const serialized = serializeDictYaml(parsed)
    assert.ok(serialized.includes('你好\thi'))
    assert.ok(serialized.includes('世界\tshi jie'))
    // 重新解析应该得到一致结果
    const reparsed = parseDictFile(serialized)
    assert.equal(reparsed.wordsOrigin.length, 2)
    assert.equal(reparsed.wordsOrigin[0].word, '你好')
    assert.equal(reparsed.wordsOrigin[1].code, 'shi jie')
})

test('serializeDictYaml: round-trip group mode preserves groups', () => {
    const yaml = HEADER.replace('sort: by_length', 'sort: by_length\ndict_grouped: true') + `## 第一组
aa\ta
ab\tb

## 第二组
ba\tc
`
    const parsed = parseDictFile(yaml)
    const serialized = serializeDictYaml(parsed)
    const reparsed = parseDictFile(serialized)
    assert.equal(reparsed.isGroupMode, true)
    assert.equal(reparsed.wordsOrigin.length, 2)
    assert.equal(reparsed.wordsOrigin[0].groupName, '第一组')
    assert.equal(reparsed.wordsOrigin[1].dict.length, 1)
})

test('serializeDictYaml: round-trip preserves priority and note', () => {
    const original = HEADER + '词\tci\t10\t注释\n'
    const parsed = parseDictFile(original)
    const serialized = serializeDictYaml(parsed)
    const reparsed = parseDictFile(serialized)
    assert.equal(reparsed.wordsOrigin[0].priority, '10')
    assert.equal(reparsed.wordsOrigin[0].note, '注释')
})

test('wordToYamlString: handles priority-only and note-only', () => {
    const baseWord = { code: 'ci', word: '词', indicator: '' }
    assert.equal(wordToYamlString({ ...baseWord, priority: '5', note: '' }), '词\tci\t5')
    assert.equal(wordToYamlString({ ...baseWord, priority: '', note: 'n' }), '词\tci\t\tn')
    assert.equal(wordToYamlString({ ...baseWord, priority: '5', note: 'n' }), '词\tci\t5\tn')
    assert.equal(wordToYamlString({ ...baseWord, priority: '', note: '' }), '词\tci')
})

test('getUnicodeStringLength: counts codepoints not UTF-16 units', () => {
    // 单字长度
    assert.equal(getUnicodeStringLength('你'), 1)
    // emoji surrogate pair 长度应为 1（一个 codepoint）
    assert.equal(getUnicodeStringLength('😀'), 1)
    // 生僻字 supplementary plane
    assert.equal(getUnicodeStringLength('𠮷'), 1)
})

test('dictToPlainObject: round-trip through Dict', () => {
    const Dict = require('../js/Dict')
    const original = HEADER + 'a\tb\t5\tn\nc\td\n'
    const dict = new Dict(original, 'x.dict.yaml', '/tmp/x.dict.yaml')
    const plain = dictToPlainObject(dict)
    assert.equal(plain.isGroupMode, false)
    assert.equal(plain.wordsOrigin.length, 2)
    const yaml = serializeDictYaml(plain)
    const reparsed = parseDictFile(yaml)
    assert.equal(reparsed.wordsOrigin[0].priority, '5')
    assert.equal(reparsed.wordsOrigin[0].note, 'n')
})