import https from 'https'
import fs    from 'fs'
import path  from 'path'

import ElasticWrapper  from './elasticWrapper'
import StoryElement    from './storyElement'
import Word            from './word'
import * as Processor  from './processor'

function parseBlob(blob)
    : {
        [service: string]: {
            methods: {
                [method: string]: {
                    type: ('action' | 'event'),
                    help?: string,
                    args: {
                        [arg: string]: {
                            help?: string,
                            required?: boolean,
                            type: string
                        }
                    }
                }
            },
            description: string,
            tags: string[]
        }
    }
{
    const all_services = {}

    blob.forEach((service: any) => {
        const {
            'configuration': {
                'actions': methods
            },
            'readme': description,
            'service': {
                'name': serviceName,
                'topics': tags
            },
            // 'serviceUuid': uuid
        } = service

        Object.keys(methods).forEach((methodName: string) => {
            const {
                'arguments': args,
                'events': _evts,
                'help': help
            } = methods[methodName]

            if (!!_evts) {
                Object.keys(_evts).forEach((eventName: string) => {
                    const {
                        'help': evtHelp,
                        'arguments': evtArgs,
                    } = _evts[eventName]

                    methods[eventName] = {
                        'type': 'event',
                        'args': evtArgs,
                        'help': evtHelp
                    }

                    delete methods[methodName]
                })
            }
            if (!!args) {
                methods[methodName] = {
                    'type': 'action',
                    'args': args,
                    'help': help
                }
            }

        })

        all_services[serviceName] = {
            'description': description,
            'methods': methods,
            'tags': tags.filter(tag => !/oms|microservice/i.test(tag))
        }
    })

    return all_services
}

getServicesBlob()
    .catch(err => {
        console.error('Failed to retreive the JSON Blob...')
        console.error(err)
    })
    .then(async (blob: any[]) => {

        let vocab:any = {}
        try {
            vocab = fs.readFileSync(path.join(__dirname, '../data/vocabulary.json'))
            vocab = JSON.parse(vocab)
        } catch (err) {
            console.error('Couldn\'t read the vocabulary file....')
        }

        const services = parseBlob(blob)

        const elastic = ElasticWrapper.Instance

        for (const serviceName of Object.keys(services)) {
            const service = services[serviceName]
            const s = new StoryElement(serviceName, [])
            await s.addToES()

            await (await Word.fromName(s.name)).addUsage(s, 70)
            for (const tag of service.tags)
                await (await Word.fromName(tag)).addUsage(s, 70)

            if (serviceName in vocab && 'vocabulary' in vocab[serviceName])
                await Processor.addWordsFromSentence(s, vocab[serviceName].vocabulary.join('. ') , 30)

            // if (!!service.description)
            //     Processor.addWordsFromSentence(s, service.description, 30)

            for (const methodName of Object.keys(service.methods)) {
                const method = service.methods[methodName]
                const m = new StoryElement(methodName, [], s)
                await m.addToES()

                await (await Word.fromName(m.name)).addUsage(m, 70)

                if (serviceName in vocab &&
                    'methods' in vocab[serviceName] &&
                    methodName in vocab[serviceName].methods
                ) {
                    await Processor.addWordsFromSentence(m, vocab[serviceName].methods[methodName].join('. ') , 30)
                }                   

                // if (!!method.help)
                //     Processor.addWordsFromSentence(m, method.help, 30)

                for (const argName of Object.keys(method.args)) {
                    const arg = method.args[argName]
                    const a = new StoryElement(argName, [], m)
                    await a.addToES()

                    await (await Word.fromName(a.name)).addUsage(a, 30)
                    // if (!!arg.help)
                    //     Processor.addWordsFromSentence(a, arg.help, 30)
                }
                console.log(`Method ${methodName} added to ElasticSearch.`)
            }
            console.log(`Service ${serviceName} added to ElasticSearch.`)
        }
    })



function getServicesBlob() {
    return new Promise((resolve, reject) => {

        fs.readFile('data/blob.json', {}, (err, rawData) => {
            try {
                const parsedData = JSON.parse(rawData as any)
                resolve(parsedData)
            } catch (e) {
                console.error(e.message)
                reject(e)
            }
        })

        return
        //
        // For now we get it from a static file, so we don't need to refresh the token every time
        //

        // https://github.com/storyscript/hub-sdk-python/blob/master/storyhub/sdk/hub.fixed.json
        https.get('https://raw.githubusercontent.com/storyscript/hub-sdk-python/master/storyhub/sdk/hub.fixed.json?token=AFMFN2MHW6Z2IXEVAIR5BDC6Y3MKQ', (res) => {
            const {statusCode} = res
            // const contentType = res.headers['content-type']

            if (statusCode !== 200) {
                const errorMessage = `Request Failed.\nStatus Code: ${statusCode}`
                console.error(errorMessage)
                // Consume response data to free up memory
                res.resume()
                reject(new Error(errorMessage))
                return
            }

            res.setEncoding('utf8')
            let rawData = ''
            res.on('data', (chunk) => {rawData += chunk})
            res.on('end', () => {
                try {
                    const parsedData = JSON.parse(rawData)
                    resolve(parsedData)
                } catch (e) {
                    console.error(e.message)
                    reject(e)
                }
            })
        }).on('error', (e) => {
            console.error(`Got error: ${e.message}`)
            reject(e)
        })
    })
}
