/**
 * Metadata for the mind map.
 *
 * @public
 */

import { mergeObjects } from './object.ts';
export interface MindMetadata {
    /** The author of the mind map. */
    author: string;
    /** The name of the mind map. */
    name: string;
    /** The version of the mind map. */
    version: string;
}

/**
 * Configuration options for the mind map.
 *
 * @public
 */
export interface MindOptions {
    rootNodeId: string;
}

export interface ViewPadding {
    left: number;
    right: number;
    top: number;
    bottom: number;
}

export const ViewExpanderStyle = {
    Char: 'char',
    Number: 'number'
} as const;

type ViewExpanderStyle = typeof ViewExpanderStyle[keyof typeof ViewExpanderStyle];

export interface ViewExpanderOptions {
    style: ViewExpanderStyle;
    // expanded: string;
    // collapsed: string;
}

/**
 * Which mechanism owns the container's inner box.
 *
 * @remarks
 * Two mechanisms move the map, and only one can be in charge: the browser
 * scrolling it inside the box (`'native'`), or a `transform` written by the
 * library (`'viewport'`). A `transform` moves content without extending the
 * scrollable area, so the two cannot both be present.
 *
 * `'viewport'` is the default: v2 moves the map with a transform unless the
 * caller asks otherwise. `'native'` has to be named explicitly, because the
 * library does not take the browser's input events - a host that only calls
 * `create()` and `open()` and then shows a map larger than the box gets a
 * canvas the browser cannot scroll and the library cannot move. Such a host has
 * to wire the gestures itself, or pass `'native'` and keep the scrollbars.
 *
 * The mode is a construction option and never changes afterwards. Taking the
 * box over folds the current scroll offset into the viewport origin and
 * replaces `overflow`, so going back would move the map and lose the gesture's
 * place; and switching forward under the reader's hand is the same jump in the
 * other direction.
 *
 * In `'native'` mode the library does not move the map at all: the five
 * commands on {@link JmViewHandle} throw instead of silently doing nothing,
 * and `getViewport()` reports the identity.
 *
 * @public
 */
export type JmViewportMode = 'native' | 'viewport';

export interface ViewOptions {
    padding: ViewPadding;
    expander: ViewExpanderOptions;
    /**
     * Which mechanism moves the map inside the container.
     *
     * @remarks
     * `'viewport'`, the default, hands the container's inner box to the
     * transform viewport: `overflow` becomes `visible` and zoom and pan write a
     * `transform`. The commands then own every movement of the map, and the
     * browser no longer scrolls it - so a host that takes the box over is the
     * one that has to drive the gestures. The exported page's shell does that;
     * the library itself does not listen to the browser's input events.
     *
     * That is the warning that comes with the default: a host that only calls
     * `create()` and `open()` and shows a map larger than its box gets a canvas
     * the browser cannot scroll and the library cannot move. Call
     * `getViewport()` to check `mode`, wire the gestures, or ask for
     * `'native'`.
     *
     * `'native'` keeps native scrolling: a map larger than the box overflows
     * it and the browser's own scrollbars reach the rest. The five viewport
     * commands are not available in that mode and throw.
     *
     * The mode is decided here, once, and never changes: switching later would
     * move the map under the reader's hand. It cannot be relaxed either -
     * taking the box over folds the scroll offset into the origin and replaces
     * `overflow`, so going back would have to restore both.
     */
    viewportMode: JmViewportMode;
}

export interface LayoutOptions {
    parentChildSpace: number;
    siblingSpace: number;
    cousinSpace: number;
    expanderSize: number;
}

/**
 * Options for JsMind.
 *
 * @public
 */
export interface JsMindOptions {
    mind: MindOptions;
    view: ViewOptions;
    layout: LayoutOptions;
}

/**
 * The options accepted when an instance is created.
 *
 * @remarks
 * Every group is optional, and so is every field inside a group: a caller can
 * pass `{ view: { viewportMode: 'native' } }` and keep the default padding
 * and expander, which is what the merge already does at runtime.
 * `Partial<JsMindOptions>` cannot express that - it only makes the groups
 * optional, so a group that is present would have to be complete.
 *
 * {@link JsMindOptions} is the resolved shape, with every field present.
 *
 * @public
 */
export interface JsMindOptionsInput {
    /** Mind map options; omitted fields use the defaults. */
    mind?: Partial<MindOptions>;
    /** View options; omitted fields use the defaults. */
    view?: Partial<ViewOptions>;
    /** Layout options; omitted fields use the defaults. */
    layout?: Partial<LayoutOptions>;
}

export const DEFAULT_METADATA: MindMetadata = {
    author: 'hizzgdev@163.com',
    name: 'jsMind Mindmap',
    version: '1.0'
};

export const DEFAULT_OPTIONS: JsMindOptions = {
    mind: {
        rootNodeId: 'root'
    },
    view: {
        padding: {
            left: 100,
            right: 100,
            top: 50,
            bottom: 50
        },
        expander: {
            style: ViewExpanderStyle.Char
            // expanded: '\u229D', // ⊝
            // collapsed: '\u2295' // ⊕
        },
        // The default, and the line v2 draws against v1: pages are expected to
        // move the map with the transform viewport. The cost is that the
        // library does not take the browser's events, so a page that wires no
        // gestures and shows a map larger than the box gets a canvas nothing
        // can move - `viewportMode: 'native'` is the way back to scrollbars.
        viewportMode: 'viewport'
    },
    layout: {
        parentChildSpace: 30,
        siblingSpace: 20,
        cousinSpace: 15,
        expanderSize: 13
    }
};

/**
 * Merges the provided options with the default options and returns a new options object.
 *
 * @remarks
 * The merge is one level deep per group: a group that is present replaces the
 * default group field by field, so a caller can set `viewportMode` and leave
 * the default padding and expander in place.
 *
 * @param options - Options to merge with the defaults; every group and every field is optional.
 * @returns A new merged options object
 *
 * @public
 */
export function mergeJsMindOptions(options?: JsMindOptionsInput): JsMindOptions {
    if (!options) {
        return { ...DEFAULT_OPTIONS };
    }

    return {
        mind: {
            ...mergeObjects(DEFAULT_OPTIONS.mind, options.mind)
        },
        view: {
            ...mergeObjects(DEFAULT_OPTIONS.view, options.view)
        },
        layout: {
            ...mergeObjects(DEFAULT_OPTIONS.layout, options.layout)
        }
    };
}
