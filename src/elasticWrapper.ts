import {Client, ApiResponse} from '@elastic/elasticsearch'
import config from '../config'

const INDEXES = config.elasticSearch.indexes

export {INDEXES}

/**
 * The catalog is a big book where you can find all the existing nets,
 * and all the fishes they can catch!
 */
export default class elasticWrapper {
    
    static instance: elasticWrapper

    _client: Client

    private constructor() {
        if (!!elasticWrapper.instance) {
            throw Error('This is a Singleton, you shouldn\'t instantiate it twice!')
        }

        this._client = new Client({
            node: `http://${config.elasticSearch.host}:${config.elasticSearch.port}`,
            resurrectStrategy: 'optimistic',
        })
    }

    static get Instance() {
        if (!elasticWrapper.instance) {
            elasticWrapper.instance = new elasticWrapper()
        }
        return elasticWrapper.instance
    }

    /**
     * Checks if an element already exists in ES
     *
     * @param props Some properties of the document (e.g. {name: "slack", methods: ["d2iuhdwer"]})
     * @param index The index containing this element
     *
     * @return the documents if found, an empty array otherwise
     */
    async searchByProperties(
        props: {[prop: string]: string},
        index: string
    ): Promise<{uuid: string, score: number, body: any}[]> {

        const searchObj = {query: {bool: {must: []}}}

        for (const key of Object.keys(props)) {
            searchObj.query.bool.must.push({
                match: {
                    [key]: props[key]
                }
            })
        }

        const queryOptions = {
            index: index,
            ignore_unavailable: true,
            body: searchObj
        }


        let res:ApiResponse<any, any>
        try {
            res = await this._client.search(queryOptions)
        } catch (err) {
            if (String(err) === 'index_not_found_exception')
                return []
            throw err
        }

        const hits = res.body.hits.hits

        if (!hits.length)
            return []

        return hits.map(({_id, _score, _source}) => ({
            uuid: _id,
            score: _score,
            body: _source
        }))
    }

    /**
     * Retrieves a document in ElasticSearch
     *
     * @param index The index containing the doc
     * @param uuid  The uuid of this doc
     *
     * @return The body of the document or null if nothing was found
     */
    async retrieve(index: string, uuid: string): Promise<any | null> {
        let res: ApiResponse<any, any>
        try {
            res = await this._client.get({
                index: index,
                id: uuid
            })
        } catch (err) {
            return null
        }

        if (!res.body._source)
            return null

        return res.body._source
    }

    /**
     * Retrieves documents in ElasticSearch
     *
     * @param uuids  The uuids of the docs
     * @param indexes  The indexes that may contain those docs, search everywhere if not provided
     *
     * @return An array containing the body of the found docs
     */
    async bulkRetrieve(uuids: string[], indexes:string[]=[]): Promise<{index: string, uuid: string, body: any}[]> {
        let res: ApiResponse<any, any>
        try {
            res = await this._client.search({
                ignore_unavailable: true,
                index: indexes.join(','),
                body: {
                    query: {
                        terms: {
                            _id: uuids
                        }
                    },
                }
            })
        } catch (err) {
            return []
        }

        const hits = res.body.hits.hits

        if (!hits.length)
            return []

        return hits.map(({_index, _id, _source}) => ({
            index: _index,
            uuid: _id,
            body: _source
        }))
    }

    /**
     * Creates a new doc in ElasticSearch
     *
     * @param index The index containing this doc
     * @param body  The body of the new doc
     * @param uuid  The uuid of the document. If this uuid
     *              already qualifies another document, it will be updated
     */
    async add(index: string, body: Object, uuid: string = ''): Promise<string> {
        const options = {
            index: index,
            body: body,
            refresh: 'true'
        }

        if (!!uuid) options['id'] = uuid

        const res = await this._client.index(options as any)

        return res.body._id
    }

    /**
     * Deletes a doc from ElasticSearch
     *
     * @param index The index containing this doc
     * @param uuid  The uuid of this doc
     *
     * @return true if the document was found (and deleted), false otherwise
     */
    async del(index: string, uuid: string): Promise<boolean> {
        try {
            await this._client.delete({
                index: index,
                id: uuid,
                refresh: 'true'
            })
        } catch (err) {
            return false
        }

        return true
    }

    /**
     * Refreshes an existing document
     *
     * @param index The index containing the document
     * @param uuid  The id of the document to update
     * @param body  The new body of the document (will be added to the old body)
     */
    async update(index: string, uuid: string, body: Object): Promise<boolean> {
        try {
            await this._client.update({
                index: index,
                id: uuid,
                refresh: 'true',
                body: {doc: body}
            })
        } catch (err) {
            return false
        }

        return true
    }

    /**
     * Updates a document using a painless script
     *
     * @param index The index containing this document
     * @param uuid The uuid of the document
     * @param script The painless script to run
     * @param args The args to be made available to the script
     *
     * @return True on success, false on failure
     */
    async updateByScript(index: string, uuid: string, script: string, args: any) {
        try {
            await this._client.update({
                index: index,
                id: uuid,
                refresh: 'true',
                body: {
                    script: {
                        lang: 'painless',
                        source: script.replace('\n', ''),
                        params: args
                    }
                }
            })
        } catch (err) {
            return false
        }

        return true
    }

    /**
     * Adds a new element into an elasticSearch array
     *
     * @param index The index containing this document
     * @param uuid The uuid of the document
     * @param array_name The name of the array (e.g. "usages")
     * @param newElem The new element to insert in the array
     */
    async arrayPush(index: string, uuid: string, array_name: string, newElem: any): Promise<boolean> {
        return await this.updateByScript(
            index,
            uuid,
            `if ( ctx._source.${array_name}.find(el -> el == params.elem) == null ) { ctx._source.${array_name}.add(params.elem); }`,
            { elem: newElem }
        )
    }
}
