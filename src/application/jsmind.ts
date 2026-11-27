
import { JmMind } from '../model/mind.ts';
import { JsMindError } from '../common/error.ts';
import { mergeJsMindOptions, type JsMindOptions } from '../common/option.ts';
import { JmView } from '../view/index.ts';
import { MindmapArranger } from '../arranger/mindmap.ts';
import { JmMindChangeCoordinator } from './mind-change-coordinator.ts';
import { JmNodeSide } from '../model/data/node.ts';
import type { JmExportImageOptions, JmExportImageResult } from '../view/export.ts';

import { JmCommander } from './commander.ts';
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
     * The mind map model class. Construct a map with `new jsMind.Mind()`, then
     * pass it to {@link JsMind.open}.
     */
    static Mind = JmMind;

    /**
     * Factory for serializers. `jsMind.Serializer.create('json')` and
     * `jsMind.Serializer.create('freemind')` are the supported formats.
     */
    static Serializer = JmMindSerializerFactory;

    /**
     * Node side values used when placing a node to the left, right, or center.
     * Same object as the `JmNodeSide` enumeration in the typings.
     */
    static NodeSide = JmNodeSide;

    /** The options for this jsMind instance. */
    options: JsMindOptions;

    /** The currently opened mind map, or null if none is open. */
    mind: JmMind | null = null;

    /** The state coordinator instance for managing the state of the mind map. */
    private readonly coordinator: JmMindChangeCoordinator;

    /** Issues display-affecting commands. */
    private readonly commander: JmCommander;

    /**
     * Commands that change what is displayed - export, pan, zoom - without
     * changing the map.
     *
     * @remarks
     * Reachable from outside so that the caller can hold on to it: a shell, a
     * toolbar button or a keyboard shortcut keeps this reference and calls it,
     * instead of going through the instance every time.
     */
    get commands(): JmCommander {
        return this.commander;
    }

    /**
     * Creates a new jsMind instance.
     *
     * @param options - Configuration options for the jsMind instance.
     */
    private constructor(
        options: JsMindOptions,
        mindChangeCoordinator: JmMindChangeCoordinator,
        commander: JmCommander
    ) {
        this.options = options;
        this.coordinator = mindChangeCoordinator;
        this.commander = commander;
    }

    /**
     * Creates a jsMind instance and attaches its view to a container.
     *
     * @param container - The container element, or the id of an element in the document.
     * @param options - Configuration for the instance. Omitted fields use the library defaults.
     * @returns A promise that resolves to the new instance. No mind map is open yet;
     *          call {@link JsMind.open} with a {@link JmMind} to display one.
     */
    static async create(container: string | HTMLElement, options?: JsMindOptions): Promise<JsMind> {
        const mergedOptions = mergeJsMindOptions(options);
        const arranger = new MindmapArranger(mergedOptions.layout);
        const view = await JmView.create(container, arranger, mergedOptions.view);
        const mindChangeCoordinator = new JmMindChangeCoordinator(arranger, view);
        const commander = new JmCommander(view);
        return new JsMind(mergedOptions, mindChangeCoordinator, commander);
    }

    /**
     * Opens a mind map.
     *
     * @param mind - The mind map instance to open.
     * @returns A promise that resolves when the mind map has been opened.
     */
    async open(mind: JmMind): Promise<void> {
        this.mind = mind;
        await this.coordinator.onMindMapOpened(mind);
        mind.observerManager.addObserver(this.coordinator);
    }


    /**
     * Closes the current mind map, if one is open.
     *
     * After `close`, {@link JsMind.mind} is `null` until you {@link JsMind.open} another map.
     */
    close(): void {
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
     * @param options - Scale, format, quality and background transparency. Defaults to PNG at 2x.
     * @returns The encoded image, as a Blob, plus its pixel dimensions.
     * @throws {@link JsMindError} If no mind map is open, or if the browser
     * cannot encode the result.
     */
    async exportImage(options?: JmExportImageOptions): Promise<JmExportImageResult> {
        if (!this.mind) {
            throw new JsMindError('No mind map is currently open');
        }
        return await this.commander.exportImage(options);
    }
}

export default JsMind;

// Example pages and the CLI image export look the library up as a global.
// Package consumers use the default export from the ESM bundle, or the CJS
// entry at `dist/jsmind.cjs`. A classic script tag loads `dist/jsmind.umd.js`,
// which assigns this same global without an `export`.
(globalThis as { jsMind?: typeof JsMind }).jsMind = JsMind;
