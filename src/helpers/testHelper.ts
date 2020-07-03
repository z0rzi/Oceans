export async function checkESConnection(esClient): Promise<false|Error> {
    return new Promise((resolve, reject) => {
        esClient.ping({}, (err: Error) => {
            if (!!err) {
                reject(err)
            } else {
                resolve()
            }
        })
    })
}


export function generateMockConfig(testFamilyName: string) {
    return {
        elasticSearch: {
            port: '9200',
            host: 'localhost',
            indexes: {
                'Words':      `test-${testFamilyName}-dictionnary`,
                'StoryElements':   `test-${testFamilyName}-story-elements`,
            }           
        }
    }
}

export async function deleteIndexes(esClient, indexNames: string[]): Promise<boolean> {
    let success = true
    for(const indexName of indexNames) {
        try {
            await esClient.indices.delete({
                ignore_unavailable: true,
                allow_no_indices: true,
                index: indexName
            })
        } catch (err) {
            console.error('Error while trying to delete the index ' + indexName + '\n', err)
            success = false
        }
    }

    return success
}
