import StoryElement from '../storyElement'
import ElasticWrapper from '../elasticWrapper'

jest.mock('../elasticWrapper')

let elastic:ElasticWrapper
let testService: StoryElement
let testMethod: StoryElement
let testArg: StoryElement

StoryElement.getIndexName = () => 'test-storyElements'

beforeEach(() => {
    elastic = ElasticWrapper.Instance
    testArg = new StoryElement('testArg')
    testMethod = new StoryElement('testMethod', [testArg])
    testService = new StoryElement('testService', [testMethod])
})

describe('Should be added to ES on add', () => {
    it('Should add it one time', async () => {
        testService.addToES = jest.fn()

        await testMethod.addToES()

        expect(elastic.add).toHaveBeenCalled()
        expect(testService.addToES).toHaveBeenCalled()
    })
    it('Should not add the same element twice', async () => {
        await testService.addToES()
        await testService.addToES()
        
        expect(elastic.add).toHaveBeenCalledTimes(1)
    })
    it('Should add parent service as well', async () => {
        testService.addToES = jest.fn()

        await testMethod.addToES()

        expect(testService.addToES).toHaveBeenCalled()
    })
})

describe('Should be deleted from ES on delete', () => {
    it('Should delete it when present in ES', async () => {
        await testMethod.addToES()
        const res = await testMethod.delFromES()
        expect(elastic.del).toHaveBeenCalled()
        expect(res).toBeTruthy()
    })
    it('Should not fail if not present in ES', async () => {
        const res = await testMethod.delFromES()
        expect(elastic.del).not.toHaveBeenCalled()
        expect(res).toBe(false)
    })
    it('Should delete children as well', async () => {
        testArg.delFromES = jest.fn()

        await testArg.addToES()
        await testMethod.addToES()
        await testMethod.delFromES()

        expect(testArg.delFromES).toHaveBeenCalled()
    })
})

describe('Should retreive an element...', () => {
    it('from its UUID', async () => {
        const uuid = await testMethod.addToES()
        await StoryElement.fromUUID(uuid)
        expect(elastic.retrieve).toHaveBeenCalledWith(StoryElement.getIndexName(), uuid)
    })
    it('from its name', async () => {
        await testMethod.addToES()
        await StoryElement.fromName(testMethod.name, testService)
        expect(elastic.searchByProperties)
            .toHaveBeenCalledWith(
                {name: testMethod.name, parent: testService.uuid},
                StoryElement.getIndexName()
            )
    })
    it('Should also retrieve the children', async () => {
        StoryElement.fromParent = jest.fn()
        elastic.retrieve = jest.fn()
            .mockImplementationOnce(() => testArg)
            .mockImplementationOnce(() => testMethod)
            .mockImplementationOnce(() => testService)
            .mockImplementation(() => null)

        const uuid = await testMethod.addToES()
        const foundMeth = await StoryElement.fromUUID(uuid, true)

        expect(StoryElement.fromParent).toHaveBeenCalledWith(foundMeth)
    })
    it('Should not retrieve the children if explicitely asked', async () => {
        StoryElement.fromUUID = jest.fn()

        const uuid = await testMethod.addToES()
        await StoryElement.fromUUID(uuid, false)

        expect(StoryElement.fromUUID).toHaveBeenNthCalledWith(1, uuid, false)
    })
    it('Should retrieve the parent service if not provided', async () => {
        StoryElement.fromUUID = jest.fn()

        const uuid = await testMethod.addToES()
        await StoryElement.fromUUID(uuid, false)

        expect(StoryElement.fromUUID).toHaveBeenCalledWith(testService.uuid, false)
    })
})

describe('Should Know whether it\'s in ES or not', () => {
    it('True if it is in ES', async () => {
        await testMethod.addToES()
        expect(testMethod.isInES()).toBeTruthy()
    })
    it('False if it is not in ES', async () => {
        expect(await testMethod.isInES()).toBeFalsy()
    })
})
