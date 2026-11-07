
import { JmMind } from '../model/mind.ts';
import { JsMindError } from '../common/error.ts';
import { mergeJsMindOptions, type JsMindOptions } from '../common/option.ts';
import { JmView } from '../view/index.ts';
import { MindmapArranger } from '../arranger/mindmap.ts';
import { JmMindChangeCoordinator } from './mind-change-coordinator.ts';
import { JmNodeSide } from '../model/data/node.ts';
import type { JmExportImageOptions, JmExportImageResult } from '../view/export.ts';

import type { JmViewHandle } from '../view/handle.ts';
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
    /**
     * What this instance may ask of the view. Typed as the narrow handle rather
     * than as the view itself: the application layer knows which capabilities it
     * uses, not what class provides them.
     */
    private readonly view: JmViewHandle;

    private constructor(
        options: JsMindOptions,
        mindChangeCoordinator: JmMindChangeCoordinator,
        view: JmViewHandle
    ) {
        this.options = options;
        this.coordinator = mindChangeCoordinator;
        this.view = view;
    }

    static async create(container: string | HTMLElement, options?: JsMindOptions): Promise<JsMind> {
        const mergedOptions = mergeJsMindOptions(options);
        const arranger = new MindmapArranger(mergedOptions.layout);
        const view = await JmView.create(container, arranger, mergedOptions.view);
        const mindChangeCoordinator = new JmMindChangeCoordinator(arranger, view);
        return new JsMind(mergedOptions, mindChangeCoordinator, view);
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

    /**
     * Renders the open mind map to an image.
     *
     * The size is the rendered content's own size: whitespace inside the
     * container is part of the picture, and a map larger than its container is
     * not cropped.
     *
     * @param options - Scale, format and quality. Defaults to PNG at 2x.
     * @returns The encoded image, as a Blob, plus its pixel dimensions.
     * @throws {@link JsMindError} If no mind map is open, or if the browser
     * cannot encode the result.
     */
    async exportImage(options?: JmExportImageOptions): Promise<JmExportImageResult> {
        if (!this.mind) {
            throw new JsMindError('No mind map is currently open');
        }
        return await this.view.capture(options);
    }
}

export default JsMind;
