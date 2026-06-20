const EOL = '\n'

function getUnicodeStringLength(str) {
    let wordLength = 0
    for (const letter of str) {
        wordLength = wordLength + 1
    }
    return wordLength
}

function wordFromLine(index, lineStr) {
    if (!lineStr) return null
    // 去除 UTF-8 BOM
    if (lineStr.charCodeAt(0) === 0xFEFF) lineStr = lineStr.slice(1)
    if (!lineStr.trim()) return null
    const wordArray = lineStr.split('\t')
    if (wordArray.length < 2 || !wordArray[0] || wordArray[1] === undefined) return null
    return {
        id: index,
        code: wordArray[1].replaceAll('\r', ''),
        word: wordArray[0],
        priority: wordArray[2] || '',
        note: wordArray[3] || '',
        indicator: '',
    }
}

function wordToYamlString(word) {
    if (word.priority && word.note) {
        return word.word + '\t' + word.code + '\t' + word.priority + '\t' + word.note
    }
    if (word.priority) {
        return word.word + '\t' + word.code + '\t' + word.priority
    }
    if (word.note) {
        return word.word + '\t' + word.code + '\t' + word.priority + '\t' + word.note
    }
    return word.word + '\t' + word.code
}

function parseNormalMode(body) {
    const startPoint = Date.now()
    body = body.replace(/\r\n/g, '\n')
    const lines = body.split(EOL)
    const lastIndex = lines.length
    const linesValid = lines.filter(item => item.indexOf('\t') > -1)
    const dictSetExceptCharacter = []
    const dictSet = new Set()
    const wordsOrigin = []
    let maxWordId = -1
    linesValid.forEach((item, index) => {
        const currentWord = wordFromLine(index, item)
        if (currentWord) {
            dictSet.add(currentWord.word)
            if (currentWord.id > maxWordId) maxWordId = currentWord.id
            wordsOrigin.push(currentWord)
        }
    })
    dictSet.forEach(w => dictSetExceptCharacter.push(w))
    console.log(`处理yaml码表文件：完成，共：${wordsOrigin.length} 条，用时 ${Date.now() - startPoint} ms`)
    return { wordsOrigin, lastIndex, lastGroupIndex: 0, dictSetExceptCharacter, maxWordId }
}

function parseGroupMode(body) {
    const startPoint = Date.now()
    body = body.replace(/\r\n/g, '\n')
    const lines = body.split(EOL)
    const wordsGroup = []
    let temp = null
    let lastItemIsEmptyLine = false
    let lastGroupIndex = 0
    const lastIndex = lines.length
    let maxWordId = -1

    lines.forEach((item, index) => {
        if (item.startsWith('##')) {
            if (temp && temp.groupName) {
                wordsGroup.push(temp)
            }
            temp = { id: lastGroupIndex++, groupName: item.substring(3).trim(), dict: [] }
            lastItemIsEmptyLine = false
        } else if (item.indexOf('\t') > -1) {
            if (!temp) {
                temp = { id: lastGroupIndex++, groupName: '', dict: [] }
            }
            const w = wordFromLine(index, item)
            if (w) {
                if (w.id > maxWordId) maxWordId = w.id
                temp.dict.push(w)
            }
            lastItemIsEmptyLine = false
        } else if (item.startsWith('#')) {
            lastItemIsEmptyLine = false
        } else {
            if (!lastItemIsEmptyLine) {
                if (temp) {
                    temp.groupName = temp.groupName || '未命名'
                    wordsGroup.push(temp)
                    temp = { id: lastGroupIndex++, groupName: '', dict: [] }
                }
            }
            lastItemIsEmptyLine = true
        }
    })

    console.log(`处理yaml码表文件：完成，共：${wordsGroup.length} 组，用时 ${Date.now() - startPoint} ms`)
    if (temp && temp.dict.length > 0) {
        wordsGroup.push(temp)
    }
    const dictSetExceptCharacter = []
    wordsGroup.forEach(group => group.dict.forEach(w => {
        if (!dictSetExceptCharacter.includes(w.word)) {
            dictSetExceptCharacter.push(w.word)
        }
    }))
    return { wordsOrigin: wordsGroup, lastIndex, lastGroupIndex, dictSetExceptCharacter, maxWordId }
}

function parseDictFile(fileContent, isForceProcessInUngroupMode) {
    const indexEndOfHeader = fileContent.indexOf('...')
    if (indexEndOfHeader < 0) {
        throw new Error('文件格式错误，没有 ... 这一行')
    }
    const headerEnd = indexEndOfHeader + 3
    const header = fileContent.substring(0, headerEnd)
    const isGroupMode = header.includes('dict_grouped: true')
    const body = fileContent.substring(headerEnd)
    let parsedBody

    if (isForceProcessInUngroupMode) {
        parsedBody = parseNormalMode(body)
    } else if (isGroupMode) {
        parsedBody = parseGroupMode(body)
    } else {
        parsedBody = parseNormalMode(body)
    }

    return {
        header,
        indexEndOfHeader: headerEnd,
        isGroupMode: isForceProcessInUngroupMode ? false : isGroupMode,
        fileName: '',
        filePath: '',
        ...parsedBody,
    }
}

function serializeDictYaml(parsed) {
    const startPoint = Date.now()
    let yamlBody
    if (parsed.isGroupMode) {
        yamlBody = parsed.wordsOrigin
            .map(group => {
                const groupHeader = `## ${group.groupName}${EOL}`
                const lines = group.dict.map(wordToYamlString)
                return groupHeader + lines.join(EOL)
            })
            .join(EOL + EOL)
    } else {
        yamlBody = parsed.wordsOrigin.map(wordToYamlString).join(EOL)
    }
    const result = parsed.header + EOL + yamlBody
    console.log(`词条文本已生成，用时 ${Date.now() - startPoint} ms`)
    return result
}

function dictToPlainObject(dict) {
    if (dict.isGroupMode) {
        return {
            header: dict.header,
            isGroupMode: true,
            wordsOrigin: dict.wordsOrigin.map(group => ({
                id: group.id,
                groupName: group.groupName,
                dict: group.dict.map(w => ({
                    id: w.id,
                    code: w.code,
                    word: w.word,
                    priority: w.priority,
                    note: w.note,
                    indicator: w.indicator || '',
                })),
            })),
        }
    }
    return {
        header: dict.header,
        isGroupMode: false,
        wordsOrigin: dict.wordsOrigin.map(w => ({
            id: w.id,
            code: w.code,
            word: w.word,
            priority: w.priority,
            note: w.note,
            indicator: w.indicator || '',
        })),
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        parseDictFile,
        serializeDictYaml,
        dictToPlainObject,
        wordToYamlString,
        getUnicodeStringLength,
    }
}
