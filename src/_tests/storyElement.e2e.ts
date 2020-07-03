import * as TestHelper from '../helpers/testHelper'

import StoryElement from '../storyElement'
import ElasticWrapper from '../elasticWrapper'

jest.mock('../../config.js', () => TestHelper.generateMockConfig('story-element'))

const elastic: ElasticWrapper = ElasticWrapper.Instance
const esClient = elastic._client

let testArg11: StoryElement,
    testArg12: StoryElement,
    testArg21: StoryElement,
    testArg22: StoryElement,
    testMethod1: StoryElement,
    testMethod2: StoryElement,
    testService: StoryElement

beforeAll(async () => {
    try {
        await TestHelper.checkESConnection(esClient)
    } catch (err) {
        console.error('Couldn\'t connect to ElasticSearch! Is it launched?')
        process.exit(1)
    }
})

beforeEach(async () => {
    testArg11 = new StoryElement('testArgument11')
    testArg12 = new StoryElement('testArgument12')
    testArg21 = new StoryElement('testArgument21')
    testArg22 = new StoryElement('testArgument22')
    testMethod1 = new StoryElement('testMethod1', [testArg11, testArg12])
    testMethod2 = new StoryElement('testMethod2', [testArg21, testArg22])
    testService = new StoryElement('testService', [testMethod1, testMethod2])
})

afterEach(async () => {
    try {
        await testService.delFromES()
        await testMethod1.delFromES()
        await testMethod2.delFromES()
        await testArg11.delFromES()
        await testArg12.delFromES()
        await testArg21.delFromES()
        await testArg22.delFromES()
    } catch (err) {
        console.error('Error trying to delete the test service/method/children...')
        throw err
    }
})

afterAll(async () => {
    await TestHelper.deleteIndexes(esClient, [
        StoryElement.getIndexName(),
        StoryElement.getIndexName(),
        StoryElement.getIndexName()
    ])
})


describe('Checking whether the method in ES or not', () => {
    it('Should be false if not in ES', async () => {

        const res = await elastic.searchByProperties({name: testMethod1.name}, testMethod1.getIndexName())

        expect(res).toStrictEqual([])
        expect(testMethod1.isInES()).toBeFalsy()
    })
    it('Should be true if in ES', async () => {
        await testMethod1.addToES()

        const res = await elastic.searchByProperties({name: testMethod1.name}, testMethod1.getIndexName())

        expect(res).toHaveLength(1)
        expect(testMethod1.isInES()).toBeTruthy()
    })
})

describe('Fetching methods', () => {
    describe('By UUID', () => {
        it('Should retreive a simple method', async () => {
            await testMethod1.addToES()
            const m = await StoryElement.fromUUID(testMethod1.uuid)
            expect(m.name).toBe(testMethod1.name)
        })
        it('Should retreive The parent as well', async () => {
            await testMethod1.addToES()
            const m = await StoryElement.fromUUID(testMethod1.uuid)
            expect(m.parent.name).toBe(testService.name)
        })
        it('Should retreive The arguments as well', async () => {
            await testMethod1.addToES()
            await testArg11.addToES()
            await testArg12.addToES()
            const m = await StoryElement.fromUUID(testMethod1.uuid)
            const argsName = m.children.map(a=>a.name)
            expect(argsName).toContain(testArg11.name)
            expect(argsName).toContain(testArg12.name)
        })
    })
    describe('By Name', () => {
        it('Should retreive a simple method', async () => {
            await testMethod1.addToES()
            const m = await StoryElement.fromName(testMethod1.name, testService)
            expect(m.name).toBe(testMethod1.name)
        })
        it('Should retreive The parent as well', async () => {
            await testMethod1.addToES()
            const m = await StoryElement.fromName(testMethod1.name, testService)
            expect(m.parent.name).toBe(testService.name)
        })
        it('Should retreive The arguments as well', async () => {
            await testMethod1.addToES()
            await testArg11.addToES()
            await testArg12.addToES()
            const m = await StoryElement.fromName(testMethod1.name, testService)
            const argsName = m.children.map(a=>a.name)
            expect(argsName).toContain(testArg11.name)
            expect(argsName).toContain(testArg12.name)
        })
    })
    describe('By Service', () => {
        it('Should retreive a simple method', async () => {
            await testMethod1.addToES()
            const methods = await StoryElement.fromParent(testService)
            expect(methods).toHaveLength(1)
            expect(methods[0].name).toBe(testMethod1.name)
        })
        it('Should retreive The arguments as well', async () => {
            await testMethod1.addToES()
            await testArg11.addToES()
            await testArg12.addToES()
            const methods = await StoryElement.fromParent(testService)
            const argsName = methods[0].children.map(a=>a.name)
            expect(argsName).toContain(testArg11.name)
            expect(argsName).toContain(testArg12.name)
        })
    })
})

describe('Adding methods to ES', () => {
    it('Should add method on addToES', async () => {
        const uuid = await testMethod1.addToES()
        const doc = await elastic.retrieve(testMethod1.getIndexName(), uuid)

        expect(!!doc).toBeTruthy()
        expect(doc.name).toBe(testMethod1.name)
    })
    it('Should add Parents as well', async () => {
        await testMethod1.addToES()

        expect(testService.isInES()).toBeTruthy()

        const serv = await elastic.retrieve(testService.getIndexName(), testService.uuid)

        expect(!!serv).toBeTruthy()
        expect(serv.name).toBe(testService.name)
    })
    it('Should not add the same method twice', async () => {
        await testMethod1.addToES()
        await testMethod1.addToES()

        const docs = await elastic.searchByProperties({name: testMethod1.name}, testMethod1.getIndexName())

        expect(docs).toHaveLength(1)
        expect(docs[0].uuid).toBe(testMethod1.uuid)
    })
    it('Should not add 2 methods with the same name if they belong to the same service', async () => {
        await testMethod1.addToES()

        const copy = new StoryElement(
            testMethod1.name,
            testMethod1.children,
            testMethod1.parent
        )

        await copy.addToES()

        const docs = await elastic.searchByProperties({name: testMethod1.name}, testMethod1.getIndexName())

        expect(docs).toHaveLength(1)
        expect(docs[0].uuid).toBe(testMethod1.uuid)
    })
    it('Should add 2 methods with the same name if they don\'t belong to the same service', async () => {
        await testMethod1.addToES()

        const otherService = new StoryElement('other')

        const copy = new StoryElement(
            testMethod1.name,
            testMethod1.children,
            otherService
        )

        await copy.addToES()

        const docs = await elastic.searchByProperties({name: testMethod1.name}, testMethod1.getIndexName())

        try {
            expect(docs).toHaveLength(2)
            const uuids = docs.map(v => v.uuid)
            expect(uuids).toContain(testMethod1.uuid)
            expect(uuids).toContain(copy.uuid)
        } finally {
            await copy.delFromES()
            await otherService.delFromES()
        }
    })
})

describe('Removing method from ES', () => {
    it('Should remove elements on delFromES()', async () => {
        await testMethod1.addToES()

        // Just to be sure...
        expect(testMethod1.isInES()).toBeTruthy()

        await testMethod1.delFromES()

        expect(testMethod1.isInES()).toBeFalsy()
        const doc = await elastic.retrieve(testMethod1.getIndexName(), testMethod1.uuid)
        expect(doc).toStrictEqual(null)
    })
    it('Should Return false when element not on ES', async () => {
        // Just to be sure...
        expect(testMethod1.isInES()).toBeFalsy()

        const s = await testMethod1.delFromES()

        expect(s).toBeFalsy()
    })
    it('Should Delete the arguments as well', async () => {
        await testMethod1.addToES()
        await testArg11.addToES()
        await testArg12.addToES()

        // Just to be sure...
        expect(testMethod1.isInES()).toBeTruthy()
        expect(testArg11.isInES()).toBeTruthy()
        expect(testArg12.isInES()).toBeTruthy()

        await testMethod1.delFromES()

        expect(testMethod1.isInES()).toBeFalsy()
        expect(testArg11.isInES()).toBeFalsy()
        expect(testArg12.isInES()).toBeFalsy()
        expect(
            await elastic.retrieve(testMethod1.getIndexName(), testMethod1.uuid) ||
            await elastic.retrieve(testArg11.getIndexName(), testArg11.uuid) ||
            await elastic.retrieve(testArg12.getIndexName(), testArg12.uuid)
        ).toBeFalsy()
    })
})

describe('Generating UUID', () => {
    it('Should generate a different UUID for 2 different methods', () => {
        expect(testMethod1.generateUUID())
            .not.toBe(testMethod2.generateUUID())
    })
    it('Should generate a different UUID for 2 methods with same name but different methods', async () => {
        const otherService = new StoryElement('other')
        const copy = new StoryElement(
            testMethod1.name,
            testMethod1.children,
            otherService
        )

        expect(testMethod1.generateUUID())
            .not.toBe(copy.generateUUID())
    })
})
