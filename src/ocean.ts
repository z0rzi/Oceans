import StoryElement from './storyElement'
import Word from './word'

enum OceanType {
    'Event' = 'Event',
    'Action' = 'Action',
    'Undefined' = 'Undefined'
}

export default class Ocean {
    type: OceanType
    raw: string
    reducedTimes: number

    vocabulary: {score: number, word: Word}[]

    usedElements: StoryElement[]

    constructor(str: string, type: OceanType) {
        this.reducedTimes = 0
        this.vocabulary = []
        this.raw = str
        this.type = type
    }

    async reduce(elems?: StoryElement[]): Promise<[StoryElement, Word[]][]> {
        if (!this.vocabulary.length) {
            await this.fetchVocabulary()
        }

        if (!this.vocabulary.length) {
            return []
        }

        this.reducedTimes++
        return []
    }

    /**
     * Gets all the known words in this Ocean, and stores it in this.vocabulary
     *
     * TODO Keep unknown words somewhere!
     */
    async fetchVocabulary() {
        this.vocabulary = await Word.fromSentence(this.raw)
    }

    /**
     * Finds the appropriate storyElements for the given ocean. This operation is the first
     * step to reduce.
     *
     * For example, for the ocean << slack me 'you look beautiful' >>, the most
     * appropriate element would be the slack!
     *
     * @return The most apppropriate elements
     *
     * @note This will only return storyElements with a depth of 0
     */
    findAppropriateElements(): StoryElement[] {
        return []
    }
}

export {OceanType}
