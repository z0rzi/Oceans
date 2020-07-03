import * as util from 'util'
import config from '../../config'

const INDEXES = config.elasticSearch.indexes

export {INDEXES}

function genUUID(input: any) {
    return util.inspect(input).replace(/\s|\n/g, '').slice(0, 30)
}

export default class mockElasticWrapper {
    static instance: mockElasticWrapper

    private constructor() {
        if (!!mockElasticWrapper.instance) {
            throw Error('This is a Singleton, you shouldn\'t instantiate it twice!')
        }
    }
    static get Instance() {
        if (!mockElasticWrapper.instance) {
            mockElasticWrapper.instance = new mockElasticWrapper()
        }
        return mockElasticWrapper.instance
    }

    add = jest.fn((idx, body) => (genUUID([idx, body])))
    del = jest.fn(() => true)
    update = jest.fn()
    updateByScript = jest.fn()
    arrayPush = jest.fn()
    retrieve = jest.fn()
    bulkRetrieve = jest.fn()
    searchByProperties = jest.fn()
}
