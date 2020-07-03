/**
 * Data Layer,
 * Handles all the JSON files
 */

import fs from 'fs'
import path from 'path'
import {BASEPATH} from '../pathGiver'

const filesPaths = {
    'contextRules': 'context.sp.json',
    'lemmatiserExtension': 'lemmatiserExtension.sp.json',
    'stopWords': 'stopWords.json',
    'idiomsReplacements': 'idiomsReplacements.sp.json',

    'servicesBlob': 'generator/servicesBlob.json',
    'vocabulary': 'generator/vocabulary.json'
}

export function getData(fileId: string): any {
    const fileFullPath  = path.join(BASEPATH , 'data/', filesPaths[fileId])
    let rawContents: Buffer
    try {
        rawContents = fs.readFileSync(fileFullPath)
    } catch(e) {
        console.error('Could not find file ' + fileFullPath + '\n' + e)
        throw e
    }

    try {
        return JSON.parse(rawContents.toString())
    } catch(e) {
        console.error('Could not parse file ' + fileFullPath + '\n' + e)
        throw e
    }
}
