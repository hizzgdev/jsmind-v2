
import { JmMind } from './model/jsmind.mind.ts';
import { JmMindJsonSerializer } from './serialization/jsmind.json.serializer.ts';
import { JmNodeContent } from './model/jsmind.node.content.ts';
import { type JsMindOptions } from './common/option.ts';
import { JmView } from './view/index.ts';
import { JmLayout } from './layout.ts';

/**
 * Main class for jsMind mind map operations.
 *
 * @public
 */
class JsMind {
    /**
     * Gets the version of jsMind.
     *
     * @returns The version string.
     */
    static get Version(): string { return '2.0'; }

    /**
     * Gets the author of jsMind.
     *
     * @returns The author string.
     */
    static get Author(): string { return 'hizzgdev@163.com'; }

    /**
     * Exported classes for browser use.
     */
    static Mind = JmMind;

    static NodeContent = JmNodeContent;

    /** The options for this jsMind instance. */
    options: JsMindOptions;

    /** The currently opened mind map, or null if none is open. */
    mind: JmMind | null;

    /** The serializer used for serialization operations. */
    serializer: JmMindJsonSerializer;

    /** The view instance for rendering the mind map. */
    view: JmView;

    layout: JmLayout;

    /**
     * Creates a new jsMind instance.
     *
     * @param options - Configuration options for the jsMind instance.
     */
    constructor(options: JsMindOptions) {
        this.options = options;
        this.mind = null;
        this.serializer = new JmMindJsonSerializer();
        this.view = new JmView(options.container, options.viewOptions);
        this.layout = new JmLayout(options.layoutOptions, this.view);
    }

    /**
     * Opens a mind map.
     *
     * @param mind - The mind map instance to open.
     * @returns The opened mind map instance.
     */
    async open(mind: JmMind): Promise<void> {
        this.mind = mind;
        await this.view.createMindNodes(mind);
        const changedNodeIds = this.layout.calculate(mind);
        await this.view.render(mind, changedNodeIds);
    }

    /**
     * Closes the current mind map (cleanup method).
     *
     * @remarks
     * This method can be extended in the future for cleanup operations
     * like removing observers, clearing caches, etc.
     */
    close(): void {
        // Empty for now - can be extended in the future
        // for cleanup operations like removing observers, clearing caches, etc.
        this.mind = null;
    }

    /**
     * Serializes the current mind map to JSON.
     *
     * @returns JSON string representation of the mind map.
     * @throws {@link Error} If no mind map is open or serialization fails.
     */
    serialize(): string {
        if (!this.mind) {
            throw new Error('No mind map is currently open');
        }

        const data = this.serializer.serialize(this.mind);
        return JSON.stringify(data);
    }
}

export default JsMind;

