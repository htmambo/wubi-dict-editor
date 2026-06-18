'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const RimeExecResolver = require('../js/RimeExecResolver')

test('parseWeaselVersion: extracts simple semver', () => {
    assert.deepEqual(RimeExecResolver.parseWeaselVersion('weasel-0.14.3'), [0, 14, 3])
})

test('parseWeaselVersion: handles 2-part versions', () => {
    assert.deepEqual(RimeExecResolver.parseWeaselVersion('weasel-0.16'), [0, 16])
})

test('parseWeaselVersion: returns null when no version found', () => {
    assert.equal(RimeExecResolver.parseWeaselVersion('not-a-version'), null)
})

test('compareVersionParts: equal lengths', () => {
    assert.equal(RimeExecResolver.compareVersionParts([0, 14, 3], [0, 14, 3]), 0)
    assert.equal(RimeExecResolver.compareVersionParts([0, 14, 3], [0, 14, 4]), -1)
    assert.equal(RimeExecResolver.compareVersionParts([0, 14, 4], [0, 14, 3]), 1)
})

test('compareVersionParts: pads missing segments', () => {
    assert.equal(RimeExecResolver.compareVersionParts([0, 14], [0, 14, 1]), -1)
    assert.equal(RimeExecResolver.compareVersionParts([0, 14, 1], [0, 14]), 1)
})

test('parseWeaselVersion: malformed segments coerce to 0 instead of NaN', () => {
    // 防御：畸形版本号不应污染后续 compareVersionParts 比较
    const parsed = RimeExecResolver.parseWeaselVersion('weasel-1.0.0a')
    assert.deepEqual(parsed, [1, 0, 0])
    assert.ok(parsed.every(n => Number.isFinite(n)))
})

test('compareVersionParts: defensive against null/undefined inputs', () => {
    // 防御：null/undefined 传入不应抛 TypeError
    assert.equal(RimeExecResolver.compareVersionParts(null, [0, 14]), -1)
    assert.equal(RimeExecResolver.compareVersionParts([0, 14], null), 1)
    assert.equal(RimeExecResolver.compareVersionParts(null, null), 0)
    assert.equal(RimeExecResolver.compareVersionParts(undefined, [0, 14]), -1)
})

test('isValidWeaselExecDir: returns false on empty/nonexistent path', () => {
    assert.equal(RimeExecResolver.isValidWeaselExecDir(''), false)
    assert.equal(RimeExecResolver.isValidWeaselExecDir(null), false)
    assert.equal(RimeExecResolver.isValidWeaselExecDir('/no/such/path'), false)
})

test('WEASEL_DEPLOYER constant', () => {
    assert.equal(RimeExecResolver.WEASEL_DEPLOYER, 'WeaselDeployer.exe')
})

test('WINDOWS_RIME_ROOTS contains both Program Files paths', () => {
    const roots = RimeExecResolver.WINDOWS_RIME_ROOTS
    assert.ok(roots.includes('C:/Program Files/Rime'))
    assert.ok(roots.includes('C:/Program Files (x86)/Rime'))
})