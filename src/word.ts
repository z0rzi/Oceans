import md5 from 'md5'

import ElasticWrapper, {INDEXES} from './elasticWrapper'
import StoryElement from './storyElement'

export default class Word {

    uuid: string
    name: string
    usages: { elem:StoryElement, weight: number }[]

    /**
     * @param esInstance An ElasticWrapper instance
     * @param name The word itself
     */
    constructor(name: string) {
        this.name = name
        this.usages = []
    }

    async enrich() {
        this.usages = await this.getUsages()
    }

    toStoryElement() {
        return this as Word
    }

    generateUUID(): string {
        return md5(this.name)
    }

    /**
     * Used to get the ElasticSearch index name for Words
     *
     * @return The ElasticSearch Index for Words
     */
    static getIndexName(): string {
        return INDEXES['Words']
    }
    getIndexName(): string {return Word.getIndexName()}

    /**
     * Retrieves a word from its UUID
     *
     * @param uuid The UUID of the word
     *
     * @return The Word if found, null otherwise
     */
    static async fromUUID(uuid: string): Promise<Word | null> {
        const esInstance = ElasticWrapper.Instance
        const rawBody = await esInstance.retrieve(this.getIndexName(), uuid)
        if (!rawBody) return null

        const w = new Word(rawBody.name)
        w.uuid = uuid
        return w
    }

    /**
     * Finds a word from its name (aka the word itself)
     *
     * @param name The word itself
     *
     * @return The Word if found, a newly created word otherwise
     */
    static async fromName(name: string): Promise<Word | null> {
        const esInstance = ElasticWrapper.Instance
        const rawWord = await esInstance.searchByProperties({name: name}, Word.getIndexName())
        if (!rawWord.length) {
            return new Word(name)
        }
        const uuid = rawWord[0].uuid
        const rawBody = rawWord[0].body

        const w = new Word(rawBody.name)
        w.uuid = uuid
        return w
    }

    /**
     * Finds registered words in a sentence
     *
     * @param sentence A sentence containing words (Duh)
     *
     * @return A list of word along with their scores
     */
    static async fromSentence(sentence: string): Promise<{word: Word, score: number}[]> {
        const esInstance = ElasticWrapper.Instance
        const res = await esInstance._client.search({
            index: this.getIndexName(),
            body: {
                query: {
                    match: {
                        name: {
                            query: sentence,
                            fuzziness: 50
                        }
                    }
                }
            }
        })

        const hits = res.body.hits.hits
        const out = []

        for (const {_source, _id, _score} of hits) {
            if (!_score) continue

            const w = new Word(_source.name)

            const usages = []
            for (const {elem, weight} of _source.usages) {
                usages.push({
                    elem: await StoryElement.fromUUID(elem),
                    weight: weight
                })
            }
            w.usages = usages
            w.uuid = _id

            out.push({score: _score, word: w})
        }

        return out
    }

    /**
     * Retrieves the words using a specific element
     *
     * @param element The element using those words
     *
     * @return The words, along with the weights it has for the element
     */
    static async fromStoryElement(
        element: StoryElement
    ): Promise<{word: Word, weight: number}[]> {
        if (! element.isInES() || element instanceof Word)
            return []

        const esInstance = ElasticWrapper.Instance
        const res = await esInstance.searchByProperties(
            {'usages.elem': element.uuid},
            this.getIndexName()
        )

        return res.map(rawWord => {
            const w = new Word(rawWord.body.name)
            w.uuid = rawWord.uuid
            return {
                word: w,
                weight: rawWord.body.usages.find(({elem}) => elem === element.uuid).weight
            }
        })
    }

    isInES(): boolean {
        return !!this.uuid
    }

    /**
     * Adds the word in ElasticSearch
     *
     * @return The uuid of the new word
     */
    async addToES(): Promise<string> {
        if (!!this.uuid)
            return this.uuid

        const ew = ElasticWrapper.Instance

        const uuid = await ew.add(
            this.getIndexName(),
            {
                name: this.name,
                usages: []
            },
            this.generateUUID()
        )

        this.uuid = uuid

        return uuid
    }

    /**
     * Deletes the word from ElasticSearch
     *
     * @return true if the word was found (and deleted), false otherwise
     */
    async delFromES(): Promise<boolean> {
        const uuid = this.uuid
        this.uuid = ''
        if (!uuid) return false

        const ew = ElasticWrapper.Instance
        return await ew.del(Word.getIndexName(), uuid)
    }

    /**
     * Adds a usage to this word
     * 
     * @param elem The new usage of this word
     * @param weight The importance of this usage for this word
     *
     * @return true on success, false on failure (e.g. this usage was already there)
     */
    async addUsage(elem: StoryElement, weight: number): Promise<boolean> {
        if (!(elem.isInES()))
            await elem.addToES()

        if (!(this.isInES()))
            await this.addToES()

        const usagesUUIDS = this.usages.map(({elem: {uuid}}) => uuid)

        if (!usagesUUIDS.includes(elem.uuid))
            this.usages.push({elem, weight})

        const ew = ElasticWrapper.Instance
        await ew.updateByScript(
            this.getIndexName(),
            this.uuid,
            `
                def usage = ctx._source.usages.find(el -> el.elem == params.elem);
                if ( usage == null ) {
                    ctx._source.usages.add(params);
                } else {
                    usage.weight += params.weight;
                }
            `,
            {
                elem: elem.uuid, weight: weight, index: elem.getIndexName()
            }
        )
        return true
    }

    /**
     * Gets the elements using this word.
     *
     * @return A list of ElasticElements, with their weights
     */
    async getUsages(): Promise<{elem: StoryElement, weight: number}[]> {

        const ew = ElasticWrapper.Instance
        const r = await ew.retrieve(this.getIndexName(), this.uuid)
        const usages = r.usages

        const res = await ew.bulkRetrieve(usages.map(({elem}) => elem), [StoryElement.getIndexName()])
        const out = []

        for (const rawElem of res) {
            const elem = await StoryElement.fromRaw(rawElem.uuid, rawElem.body)

            const usage = usages.find(({elem}) => elem === rawElem.uuid)

            out.push({
                weight: usage.weight,
                elem: elem
            })
        }

        this.usages = out

        return out
    }
}
