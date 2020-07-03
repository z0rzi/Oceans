import Word from '../word'
import StoryElement from '../storyElement'
import ElasticWrapper from '../elasticWrapper'

jest.mock('../elasticWrapper')
jest.mock('../storyElement')

Word.getIndexName = () => 'test_words'

let elastic:ElasticWrapper
let testWord: Word
let testArg: StoryElement
let testMethod: StoryElement
let testService: StoryElement

beforeEach(() => {
    elastic = ElasticWrapper.Instance
    testArg = new StoryElement('testArg')
    testMethod = new StoryElement('testMethod', [testArg])
    testService = new StoryElement('testService', [testMethod])
    testWord = new Word('testWord')
})

describe('Should be added to ES on add', () => {
    it('Should add it one time', async () => {
        await testWord.addToES()

        expect(elastic.add).toHaveBeenCalled()
    })
    it('Should not add the same word twice', async () => {
        await testWord.addToES()
        await testWord.addToES()
        
        expect(elastic.add).toHaveBeenCalledTimes(1)
    })
})

describe('Should be deleted from ES on delete', () => {
    it('Should delete it when present in ES', async () => {
        await testWord.addToES()
        const res = await testWord.delFromES()
        expect(elastic.del).toHaveBeenCalled()
        expect(res).toBeTruthy()
    })
    it('Should fail if not present in ES', async () => {
        const res = await testWord.delFromES()
        expect(elastic.del).not.toHaveBeenCalled()
        expect(res).toBe(false)
    })
})

describe('Should retreive a word...', () => {
    it('from its UUID', async () => {
        const uuid = await testWord.addToES()
        await Word.fromUUID(uuid)
        expect(elastic.retrieve).toHaveBeenCalledWith(Word.getIndexName(), uuid)
    })
    it('from its name', async () => {
        await testWord.addToES()
        elastic.searchByProperties = jest.fn().mockImplementation(() => ([{
            uuid: testWord.uuid,
            body: {
                name: testWord.name,
                usages: []
            }
        }]))
        await Word.fromName(testWord.name)
        expect(elastic.searchByProperties).toHaveBeenCalledWith({name: testWord.name}, Word.getIndexName())
    })
})

describe('Should Know whether it\'s in ES or not', () => {
    it('True if it is in ES', async () => {
        await testWord.addToES()
        expect(testWord.isInES()).toBeTruthy()
    })
    it('False if it is not in ES', async () => {
        expect(await testWord.isInES()).toBeFalsy()
    })
})

describe('Should add / remove usages', () => {
    it('should add elems to es if not already present', async () => {
        testWord.addToES = jest.fn()

        testWord.getUsages = jest.fn().mockImplementationOnce(() => [])
        await testWord.addUsage(testService, 50)

        expect(testWord.addToES).toHaveBeenCalled()
        expect(testService.addToES).toHaveBeenCalled()
    })
    it('should add the usage', async () => {
        testWord.addToES = jest.fn()

        testWord.getUsages = jest.fn().mockImplementationOnce(() => [])
        await testWord.addUsage(testService, 50)

        expect(elastic.updateByScript).toHaveBeenCalled()
    })
})
describe('Should find usages', () => {
    it('Should find usages of words', async () => {
        testService.addToES()
        testMethod.addToES()
        elastic.retrieve = jest.fn().mockImplementation(() => ({
            name: testWord.name,
            usages: [
                {elem: testService.uuid, weight: 10},
                {elem: testMethod.uuid, weight: 40}
            ]
        }))
        elastic.bulkRetrieve = jest.fn().mockImplementation(() => ([
            {
                index: StoryElement.getIndexName(),
                uuid: testService.uuid,
                elem: {
                    name: testService.name
                }           
            },
            {
                index: StoryElement.getIndexName(),
                uuid: testMethod.uuid,
                elem: {
                    name: testMethod.name
                }           
            }
        ]))
        StoryElement.fromUUID = jest.fn().mockImplementation(() => testArg)
        StoryElement.fromUUID = jest.fn().mockImplementation(() => testMethod)
        StoryElement.fromUUID = jest.fn().mockImplementation(() => testService)
        StoryElement.fromRaw = jest.fn().mockImplementation(() => testArg)
        StoryElement.fromRaw = jest.fn().mockImplementation(() => testMethod)
        StoryElement.fromRaw = jest.fn().mockImplementation(() => testService)

        const usages = await testWord.getUsages()

        expect(usages).toHaveLength(2)
        expect(usages.map(usage => usage.elem.uuid)).toContain(testService.uuid)
        expect(usages.map(usage => usage.elem.uuid)).toContain(testMethod.uuid)
    })
})
