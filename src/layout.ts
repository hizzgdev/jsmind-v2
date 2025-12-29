import type { LayoutOptions } from './common/option.ts';
import type { JmMind } from './model/jsmind.mind.ts';
import type { JmView } from './view/index.ts';

export class JmLayout {
    options: LayoutOptions;

    constructor(options: LayoutOptions) {
        this.options = options;
    }

    /**
     * Layout the mind map.
     * @param _mind - The mind map data model
     * @param _view - The view instance
     * @returns The list of node IDs that need to be updated
     */
    layoutMind(_mind: JmMind, _view: JmView): string[] {
        const nodeIds: string[] = [];
        return nodeIds;
    }
}
