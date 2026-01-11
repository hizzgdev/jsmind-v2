
import { JmMind } from '../model/mind.ts';
import { JmNodeContent } from '../model/data/node-content.ts';
import { mergeJsMindOptions, type JsMindOptions } from '../common/option.ts';
import { JmView } from '../view/index.ts';
import { MindmapArranger } from '../arranger/mindmap.ts';
import { JmMindChangeCoordinator } from './mind-change-coordinator.ts';
import { JmNodeSide } from '../model/data/node.ts';
import { JmMindSerializerFactory } from '../serialization/serializer-factory.ts';

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

    static Serializer = JmMindSerializerFactory;

    static NodeSide = JmNodeSide;

    /** The options for this jsMind instance. */
    options: JsMindOptions;

    /** The currently opened mind map, or null if none is open. */
    mind: JmMind | null = null;

    /** The state coordinator instance for managing the state of the mind map. */
    private readonly coordinator: JmMindChangeCoordinator;

    /**
     * Creates a new jsMind instance.
     *
     * @param options - Configuration options for the jsMind instance.
     */
    private constructor(options: JsMindOptions, mindChangeCoordinator: JmMindChangeCoordinator) {
        this.options = options;
        this.coordinator = mindChangeCoordinator;
    }

    static async create(container: string | HTMLElement, options: JsMindOptions): Promise<JsMind> {
        const mergedOptions = mergeJsMindOptions(options);
        const arranger = new MindmapArranger(mergedOptions.layout);
        const view = await JmView.create(container, arranger, mergedOptions.view);
        const mindChangeCoordinator = new JmMindChangeCoordinator(arranger, view);
        return new JsMind(mergedOptions, mindChangeCoordinator);
    }

    /**
     * Opens a mind map.
     *
     * @param mind - The mind map instance to open.
     * @returns The opened mind map instance.
     */
    async open(mind: JmMind): Promise<void> {
        this.mind = mind;
        await this.coordinator.onMindMapOpened(mind);
        mind.observerManager.addObserver(this.coordinator);
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
        if(this.mind) {
            this.coordinator.onMindMapClosed(this.mind!);
            this.mind = null;
        }
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

        const serializer = JmMindSerializerFactory.create('json');
        const data = serializer.serialize(this.mind);
        return JSON.stringify(data);
    }
}

export default JsMind;

