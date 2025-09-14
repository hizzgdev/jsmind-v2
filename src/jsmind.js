// eslint-disable-next-line no-unused-vars
import { JmMind } from './model/jsmind.mind.js';
import { JmMindJsonSerializer } from './serialization/jsmind.json.serializer.js';

class JsMind {
    static get Version() { return '2.0'; }

    static get Author() { return 'hizzgdev@163.com'; }

    constructor(options) {
        this.options = options;
        this.mind = null;
        this.serializer = new JmMindJsonSerializer();
    }

    /**
     * Open a mind map
     * @param {JmMind} mind - The mind map instance to open
     * @returns {JmMind} The opened mind map instance
     */
    open(mind) {
        this.mind = mind;
        return mind;
    }

    /**
     * Close a mind map (cleanup method)
     */
    close() {
        // Empty for now - can be extended in the future
        // for cleanup operations like removing observers, clearing caches, etc.
        this.mind = null;
    }

    /**
     * Serialize the current mind map to JSON
     * @returns {string} JSON string representation of the mind map
     * @throws {Error} If no mind map is open or serialization fails
     */
    serialize() {
        if (!this.mind) {
            throw new Error('No mind map is currently open');
        }

        const data = this.serializer.serialize(this.mind);
        return JSON.stringify(data);
    }
}

export default JsMind;
