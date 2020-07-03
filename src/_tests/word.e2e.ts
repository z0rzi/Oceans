import * as TestHelper from '../helpers/testHelper'

import StoryElement from '../storyElement'
import ElasticWrapper from '../elasticWrapper'
import Word from '../word'

jest.mock('../../config.js', () => TestHelper.generateMockConfig('word'))

const elastic: ElasticWrapper = ElasticWrapper.Instance
const esClient = elastic._client

let testArg11: StoryElement,
    testArg12: StoryElement,
    testArg21: StoryElement,
    testArg22: StoryElement,
    testMethod1: StoryElement,
    testMethod2: StoryElement,
    testService: StoryElement,
    testWord: Word

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
    testWord = new Word('testWord')
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
        await testWord.delFromES()
    } catch (err) {
        console.error('Error trying to delete the test service/method/args...', err)
        throw err
    }
})

afterAll(async () => {
    await TestHelper.deleteIndexes(esClient, [
        StoryElement.getIndexName(),
        Word.getIndexName()
    ])
})


describe('Checking whether the word in ES or not', () => {
    it('Should be false if not in ES', async () => {

        const res = await elastic.searchByProperties({name: testWord.name}, testWord.getIndexName())

        expect(res).toStrictEqual([])
        expect(testWord.isInES()).toBeFalsy()
    })
    it('Should be true if in ES', async () => {
        await testWord.addToES()

        const res = await elastic.searchByProperties({name: testWord.name}, testWord.getIndexName())

        expect(res).toHaveLength(1)
        expect(testWord.isInES()).toBeTruthy()
    })
})

describe('Fetching words', () => {
    describe('By UUID', () => {
        it('Should retreive a simple word', async () => {
            await testWord.addToES()
            const w = await Word.fromUUID(testWord.uuid)
            expect(w.name).toBe(testWord.name)
        })
    })
    describe('By Name', () => {
        it('Should retreive a simple word', async () => {
            await testWord.addToES()
            const w = await Word.fromName(testWord.name)
            expect(w.name).toBe(testWord.name)
        })
        it('Should create the word if not present in ES', async () => {
            const w = await Word.fromName(testWord.name)
            expect(w).toBeInstanceOf<Word>(Word as any)
            expect(w.isInES()).toBeFalsy()
        })
    })
    it('By Elastic Element', async () => {
        await testWord.addUsage(testService, 10)

        const words = await Word.fromStoryElement(testService)

        expect(words).toHaveLength(1)
        expect(words[0].weight).toBe(10)
        expect(words[0].word.uuid).toStrictEqual(testWord.uuid)
        expect(words[0].word.name).toStrictEqual(testWord.name)
    })
    describe('By Sentence', () => {
        it('Should retreive a word contained in a sentence', async () => {
            await testWord.addToES()

            const res = await Word.fromSentence(`The word I'm looking for is ${testWord.name}`)

            expect(res).toHaveLength(1)
            expect(res[0].word.name).toBe(testWord.name)
        })
        it('Should retreive many word contained in a sentence', async () => {
            const words = 'explosion fox yellow fast quick lazy'

            const wordsInstances: Word[] = []
            for (const word of words.split(/\s+/)) {
                const w = await new Word(word)
                await w.addToES()
                wordsInstances.push(w)
            }

            const res = await Word.fromSentence(
                'The quick brown fox jumps over the lazy dog'
            )

            try {
                // "fox", "quick" and "lazy" should match

                expect(res).toHaveLength(3)

                const names = res.map(w=>w.word.name)
                expect(names).toContain('fox')
                expect(names).toContain('quick')
                expect(names).toContain('lazy')
            } finally {
                for(const w of wordsInstances) {
                    await w.delFromES()
                }
            }
        })
    })
})

describe('Adding words to ES', () => {
    it('Should add word on addToES', async () => {
        const uuid = await testWord.addToES()
        const doc = await elastic.retrieve(testWord.getIndexName(), uuid)

        expect(!!doc).toBeTruthy()
        expect(doc.name).toBe(testWord.name)
    })
    it('Should add Parents as well', async () => {
        await testWord.addToES()

        expect(testWord.isInES()).toBeTruthy()

        const word = await elastic.retrieve(testWord.getIndexName(), testWord.uuid)

        expect(!!word).toBeTruthy()
        expect(word.name).toBe(testWord.name)
    })
    it('Should not add the same word twice', async () => {
        await testWord.addToES()
        await testWord.addToES()

        const docs = await elastic.searchByProperties({name: testWord.name}, testWord.getIndexName())

        expect(docs).toHaveLength(1)
        expect(docs[0].uuid).toBe(testWord.uuid)
    })
    it('Should not add 2 words with the same name if they belong to the same service', async () => {
        await testWord.addToES()

        const copy = new Word(testWord.name)

        await copy.addToES()

        const docs = await elastic.searchByProperties({name: testWord.name}, testWord.getIndexName())

        expect(docs).toHaveLength(1)
        expect(docs[0].uuid).toBe(testWord.uuid)
    })
})

describe('Removing word from ES', () => {
    it('Should remove words on delFromES()', async () => {
        await testWord.addToES()

        // Just to be sure...
        expect(testWord.isInES()).toBeTruthy()

        await testWord.delFromES()

        expect(testWord.isInES()).toBeFalsy()
        const doc = await elastic.retrieve(testWord.getIndexName(), testWord.uuid)
        expect(doc).toStrictEqual(null)
    })
    it('Should Return false when word not on ES', async () => {
        // Just to be sure...
        expect(testWord.isInES()).toBeFalsy()

        const s = await testWord.delFromES()

        expect(s).toBeFalsy()
    })
})

describe('Enrichement', () => {
    it('Should add usages on enrichement', async () => {
        await testWord.addUsage(testService, 10)
        testWord.usages = []
        await testWord.enrich()

        expect(testWord.usages).toHaveLength(1)
        expect(testWord.usages[0].weight).toBe(10)
        expect(testWord.usages[0].elem.uuid).toBe(testService.uuid)
    })
})

describe('Generating UUID', () => {
    it('Should generate a different UUID for 2 different words', () => {
        const other = new Word('other')

        expect(testWord.generateUUID())
            .not.toBe(other.generateUUID())
    })
})

describe('Adding usages', () => {
    it('Should add the new Usage to the usages property', async () => {
        await testWord.addUsage(testService, 10)

        expect(testWord.usages).toHaveLength(1)
        expect(testWord.usages[0].elem.uuid).toBe(testService.uuid)
    })
    it('Should be able to add a usage', async () => {
        await testWord.addUsage(testService, 10)
        expect(testWord.isInES()).toBeTruthy()
        expect(testService.isInES()).toBeTruthy()

        const raw = await elastic.retrieve(testWord.getIndexName(), testWord.uuid)

        expect(raw).toHaveProperty('usages')
        expect(Array.isArray(raw.usages)).toBeTruthy()
        expect(raw.usages).toHaveLength(1)
        expect(raw.usages[0].elem).toBe(testService.uuid)
        expect(raw.usages[0].weight).toBe(10)
    })
    it('Should sum the weight when adding same usage twice', async () => {
        await testWord.addUsage(testService, 10)
        await testWord.addUsage(testService, 12)
        await testWord.addUsage(testService, 15)
        expect(testWord.isInES()).toBeTruthy()
        expect(testService.isInES()).toBeTruthy()

        const raw = await elastic.retrieve(testWord.getIndexName(), testWord.uuid)

        expect(raw).toHaveProperty('usages')
        expect(Array.isArray(raw.usages)).toBeTruthy()
        expect(raw.usages).toHaveLength(1)
        expect(raw.usages[0].elem).toBe(testService.uuid)
        expect(raw.usages[0].weight).toBe(37)
    })
})
