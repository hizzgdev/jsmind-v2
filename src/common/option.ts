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

export interface ViewPadding {
    left: number;
    right: number;
    top: number;
    bottom: number;
}

export interface ViewOptions {
    theme: string;
    padding: ViewPadding;
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
        theme: 'default',
        padding: {
            left: 50,
            right: 50,
            top: 100,
            bottom: 100
        }
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
 * @param options - Partial options to merge with default options
 * @returns A new merged options object
 *
 * @public
 */
export function mergeJsMindOptions(options?: Partial<JsMindOptions>): JsMindOptions {
    if (!options) {
        return { ...DEFAULT_OPTIONS };
    }

    return {
        mind: {
            ...mergeFlatOptions(DEFAULT_OPTIONS.mind, options.mind)
        },
        view: {
            ...mergeFlatOptions(DEFAULT_OPTIONS.view, options.view)
        },
        layout: {
            ...mergeFlatOptions(DEFAULT_OPTIONS.layout, options.layout)
        }
    };
}


/**
 * Merges user values with default values.
 *
 * @private
 * @param defaultValues - Default values.
 * @param userValues - User-provided values.
 * @returns Merged values.
 */
export function mergeFlatOptions<T>(defaultValues: T, userValues?: Partial<T>): T {
    if (!userValues) {
        return { ...defaultValues };
    }

    return {
        ...defaultValues,
        ...userValues
    } as T;
}
