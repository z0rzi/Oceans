

export default class StoryElement {
    public uuid = ''

    constructor(name, children, parent) {}

    static getIndexName = jest.fn(() => 'storyElement')
    static fromUUID = jest.fn()
    static fromName = jest.fn()
    static fromRaw = jest.fn()
    getIndexName = jest.fn(() => 'storyElement')
    generateUUID = jest.fn()
    isInES = jest.fn(function() {return !!this.uuid})
    addToES = jest.fn(function() {this.uuid = 'dummyElem'})
    delFromES = jest.fn(function() {this.uuid = ''})
}
