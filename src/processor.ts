import StringParser from './data/stringParser'
import Ocean, {OceanType} from './ocean' 
import * as Data from './data/data'

import ElasticWrapper from './elasticWrapper'
import * as Normalizer from './language/normalizer'
import StoryElement from './storyElement'
import Word from './word'

export function createOceans(sentence: string): Ocean[] {

    const {definitions, matches} = Data.getData('contextRules')

    const oceans = []

    new StringParser(matches, definitions)
        .parseString(
            sentence,
            (match: string, replacement: string) => {
                if (replacement === 'event') {
                    oceans.push(
                        new Ocean(match, OceanType.Event)
                    )
                } else if (replacement === 'action') {
                    oceans.push(
                        new Ocean(match, OceanType.Action)
                    )
                }
            },
            (nonMatch: string) => {
                oceans.push(
                    new Ocean(nonMatch, OceanType.Action)
                )
            }
        )

    return oceans
}

/**
 * To add informations about an elastic element
 *
 * @param element The element to add the words to
 * @param sentence The sentence to extract the words from
 * @param weight The weight to give to the extracted words
 */
export async function addWordsFromSentence(element: StoryElement, sentence: string, weight: number) {
    if (element instanceof Word) {
        throw new Error('ElasticToolbox.addElasticWordsTo() - Can\'t add usages to a word!')
    }

    if (!element.isInES()) await element.addToES()

    const words = Normalizer.identifyImportantWords(sentence)

    console.log(words)

    for (const word of words) {
        await (await Word.fromName(word)).addUsage(element, weight)
    }           
}

/**
 * Used to search for **anything**
 *
 * @param sentence The sentence to use as a serch term. Will be analysed thoroughly
 *
 * @return The Services matching the given sentence. Each StoryElement will be given a score
 */
async function search(sentence: string): Promise<StoryElement[]>
{
    sentence += '. ' + Normalizer.identifyImportantWords(sentence)
    const words = await Word.fromSentence(sentence)

    const foundServices: StoryElement[] = []
    for (const {word, score} of words) {
        if (score === 0) continue

        const usages = await word.getUsages()

        for (let {elem, weight} of usages) {
            let finalScore = score*weight

            let suuid: string, muuid: string, auuid: string

            if (elem instanceof StoryElement) {
                auuid = elem.uuid
                elem = elem.parent
                finalScore /= 2
            }
            if (elem instanceof StoryElement) {
                muuid = elem.uuid
                elem = elem.parent
                finalScore /= 2
            }
            suuid = elem.uuid

            let service = foundServices.find(s => s.uuid === suuid)
            if (!service) {
                // StoryElement not registered yet
                service = elem as StoryElement
                foundServices.push(service)
            }
            // await service.enrich(true)
            service.score += finalScore
            finalScore *= 2

            if (!muuid) continue
            let method = service.children.find(m => m.uuid === muuid)
            if (!method) {
                // Should not happen....
                method = elem as StoryElement
                service.children.push(method)
            }
            method.score += finalScore
            finalScore *= 2

            if (!auuid) continue
            let arg = method.children.find(a => a.uuid === auuid)
            if (!arg) {
                // Should not happen....
                arg = elem as StoryElement
                method.children.push(arg)
            }
            arg.score += finalScore
        }
    }

    const sortByScore = ({score: a} ,{score: b}) => b - a

    // Sorting to have the best score first
    foundServices.sort(sortByScore)

    foundServices.forEach(service => {
        service.children.sort(sortByScore)

        service.children.forEach(method => {
            method.children.sort(sortByScore)
        })
    })

    return foundServices
}
