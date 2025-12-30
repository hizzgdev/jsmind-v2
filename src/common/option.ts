/**
 * Metadata for the mind map.
 *
 * @public
 */
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

export interface ViewOptions {
    theme: string;
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
        theme: 'default'
    },
    layout: {
        parentChildSpace: 30,
        siblingSpace: 20,
        cousinSpace: 15,
        expanderSize: 13
    }
};

