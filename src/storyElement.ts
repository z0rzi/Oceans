import md5 from 'md5'

import ElasticWrapper, {INDEXES} from './elasticWrapper'
import Ocean, {OceanType} from './ocean'

/**
 * A StoryElement represents a filter, that can catch fiches in an Ocean (=> that can recognize words within a sentence)
 */
export default class StoryElement {

    uuid: string
    name: string
    score: number
    children: StoryElement[]
    parent: StoryElement
    _type: OceanType

    /**
     * @param name     The name of the element (e.g. 'slack', or 'listen')
     * @param children The children of this element (can also be added later on)
     * @param parent   The parent of this element
     */
    constructor(
        name: string,
        children: StoryElement[] = [],
        parent?: StoryElement,
        type?: OceanType
    ) {
        this.score = 0
        this.name = name
        this.children = []
        for (const child of children) {
            this.addChild(child)
        }
        this.parent = parent
        this._type = type
    }

    /**
     * The smaller the element, the smaller fish it can catch!
     * Big elements (depth 0) will catch big fishes (e.g. Slack, Wolfram), and small elements will catch small fishes (e.g. nice, yesterday)
     *
     * @return The depth of the element (0 = big)
     */
    get depth(): number {
        if (!this.parent) return 0
        return this.parent.depth + 1
    }

    /**
     * The type of ocean, event or action
     */
    get type(): OceanType {
        if (this._type) return this._type
        if (this.parent) return this.parent.type
        return undefined
    }

    /**
     * Adds a child to this element.
     *
     * @param child The child element
     *
     * @return true on success, false on failure (e.g. child already exists)
     */
    addChild(child: StoryElement): boolean {
        if (!Array.isArray(this.children))
            this.children = []

        if (this.hasAsParent(child) || child.hasAsParent(this))
            return false

        if (this.children.indexOf(child) !== -1)
            return false

        child.parent = this

        this.children.push(child)
        return true
    }

    /**
     * Checks whether the given element is a parent of this
     *
     * @param element The potential parent
     *
     * @return true if it's a parent, false otherwise
     */
    hasAsParent(element: StoryElement) {
        if (!this.parent) return false
        if (element === this.parent) return true
        return this.parent.hasAsParent(element)
    }

    generateUUID(): string {
        let blob = ''
        if (this.parent)
            blob += this.parent.generateUUID()
        blob += this.name

        return md5(blob)
    }

    /**
     * Gets a element from a UUID
     *
     * @param uuid The uuid corresponding to this element
     * @param shouldRetrieveChildren Whether the chiildren of this element should be retrieved or not 
     *
     * @return The element if found, null otherwise
     */
    static async fromUUID(
        uuid: string,
        shouldRetreiveChildren: boolean = true,
    ): Promise<StoryElement> {

        const esInstance = ElasticWrapper.Instance

        const rawBody = await esInstance.retrieve(this.getIndexName(), uuid)
        if (!rawBody) {
            return null
        }
        const m = await StoryElement.fromRaw(uuid, rawBody)

        if (shouldRetreiveChildren) await m.retreiveChildren()

        m.uuid = uuid

        return m
    }

    /**
     * Retrieves the children from ES, overrides all already present children.
     */
    async retreiveChildren(): Promise<StoryElement[]> {
        this.children = await StoryElement.fromParent(this)
        return this.children
    }

    /**
     * Retrieves an element from its name and parent
     *
     * @param name                   The name of the element
     * @param parent                 The parent ot this element
     * @param shouldRetreiveChildren Whether the children of this element should be retrieved or not 
     *
     * @return The element if found, null otherwise
     */
    static async fromName(
        name: string,
        parent?: StoryElement,
        shouldRetreiveChildren: boolean = true
    ): Promise<StoryElement> {
        
        const esInstance = ElasticWrapper.Instance

        const props = {name}
        if (parent) props['parent'] = parent.uuid

        const rawServ = await esInstance.searchByProperties(props, this.getIndexName())
        if (!rawServ || !rawServ.length) return null
        const uuid = rawServ[0].uuid
        rawServ[0].body

        const m = new StoryElement(name, [], parent)
        m.uuid = uuid

        if (shouldRetreiveChildren) await m.retreiveChildren()

        return m
    }

    /**
     * Parses a element from its serialized state
     *
     * @param uuid   The uuid corresponding to this element
     * @param raw    The raw body contained in ElasticSearch
     * @param parent The parent, will fetch it of not provided
     *
     * @return The element
     */
    static async fromRaw(uuid: string, raw: {name: string, parent: string}, parent?: StoryElement) {

        const m = new StoryElement(
            raw.name,
            [],
            parent ? parent : await StoryElement.fromUUID(raw.parent, false)
        )
        m.uuid = uuid
        return m
    }

    /**
     * Retrieves child elements from a given parent
     *
     * @param parent                 The parent
     * @param shouldRetreiveChildren Whether the children of the found elements should be retrieved or not 
     *
     * @return an array of elements
     */
    static async fromParent(parent: StoryElement, shouldRetreiveChildren = true): Promise<StoryElement[]> {

        const esInstance = ElasticWrapper.Instance

        const elements = await esInstance.searchByProperties({parent: parent.uuid}, this.getIndexName())

        const out = []
        for (const element of elements) {
            const m = await StoryElement.fromRaw(element.uuid, element.body, parent)
            if (shouldRetreiveChildren) await m.retreiveChildren()

            out.push(m)
        }

        return out
    }

    /**
     * @return Whether this element is in ElasticSearch or not
     */
    isInES(): boolean {
        return !!this.uuid
    }

    static getIndexName(): string {
        return INDEXES['StoryElements']
    }
    getIndexName(): string {return StoryElement.getIndexName()}

    /**
     * Adds this element to ElasticSearch. If it's already present in ES, the old
     * version will be overwritten by the new one
     *
     * @return The UUID of the created element
     */
    async addToES(): Promise<string> {
        if (!!this.uuid) return this.uuid


        if (this.parent && !this.parent.isInES()) {
            await this.parent.addToES()
        }

        const esInstance = ElasticWrapper.Instance

        const uuid = await esInstance.add(
            this.getIndexName(),
            {
                'name': this.name,
                'parent': this.parent ? this.parent.uuid : null
            },
            this.generateUUID()
        )

        this.uuid = uuid

        return uuid
    }

    /**
     * Deletes this element from ElasticSearch.
     */
    async delFromES(): Promise<boolean> {
        for (const child of this.children) {
            await child.delFromES()
        }
        const uuid = this.uuid
        this.uuid = ''

        if (!uuid) return false

        const esInstance = ElasticWrapper.Instance
        return await esInstance.del(this.getIndexName(), uuid)
    }
}
