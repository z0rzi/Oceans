import inquirer from 'inquirer'
import * as Processor from './processor'

async function newSentence() {
    let res : {sentence: string}
    try {
        res = await inquirer
            .prompt([
                {
                    name: 'sentence',
                    message: 'Type a sentence'
                }
            ])
    } catch (err) {
        if(err.isTtyError) {
            console.error(err)
        } else {
            console.error(err)
        }
    }

    const oceans = Processor.createOceans(res.sentence)
    oceans.forEach(ocean => {
        ocean.reduce()
    })

    console.log(oceans)
    newSentence()
}

newSentence()
