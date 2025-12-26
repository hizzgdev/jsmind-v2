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

/**
 * Options for JsMind.
 *
 * @public
 */
export interface JsMindOptions {
    container: string | HTMLElement;
    mind: MindOptions;
    viewOptions: ViewOptions;
}

export const DEFAULT_METADATA: MindMetadata = {
    author: 'hizzgdev@163.com',
    name: 'jsMind Mindmap',
    version: '1.0'
};

export const DEFAULT_OPTIONS: JsMindOptions = {
    container: '',
    viewOptions: {
        theme: 'default'
    },
    mind: {
        rootNodeId: 'root'
    }
};

