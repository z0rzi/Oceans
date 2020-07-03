import Ocean, {OceanType} from '../ocean'

describe('Fetching vocabulary', () => {
    it('Shouldn\'t find any vocabulary for an empty Ocean', async () => {
        const ocean = new Ocean('', OceanType.Undefined)

        ocean.fetchVocabulary()

        expect(ocean.vocabulary).toStrictEqual([])
    })
})
