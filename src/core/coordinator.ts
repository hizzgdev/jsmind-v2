import type { Arranger } from '../arranger/index.ts';
import { MindmapArranger } from '../arranger/mindmap.ts';
import type { JmMind } from '../model/mind.ts';
import type { JmView } from '../view/index.ts';
import { JmMindEventObserver } from './observer.ts';
import { debug } from '../common/debug.ts';
import type { JmMindEventDataOnNodeRemoved, JmMindEventDataOnNodeUpdated, JmMindEventDataOnNodeMoved, JmMindEventDataOnEdgeAdded, JmMindEventDataOnEdgeRemoved, JmMindEventDataOnNodeAdded } from '../model/event/data.ts';

export class JmStateCoordinator extends JmMindEventObserver {

    private readonly arranger: Arranger;

    private readonly view: JmView;

    constructor(arranger: Arranger, view: JmView) {
        super();
        this.arranger = arranger;
        this.view = view;
    }

    async onMindMapOpened(mind: JmMind): Promise<void> {
        await this.view.measureNodeSizes(mind);
        this.arranger.calculate(mind);
        await this.view.settle(mind);
        if (this.arranger instanceof MindmapArranger) {
            this.arranger.printCacheStats();
        }
    }

    onMindMapClosed(_mind: JmMind): void {
        // Empty for now - can be extended in the future
        // for cleanup operations like removing observers, clearing caches, etc.
    }

    onNodeAdded(mind: JmMind, event: JmMindEventDataOnNodeAdded): void {
        debug('onNodeAdded', mind.meta.name, event);
    }

    onNodeRemoved(mind: JmMind, event: JmMindEventDataOnNodeRemoved): void {
        debug('onNodeRemoved', mind.meta.name, event);
    }

    onNodeUpdated(mind: JmMind, event: JmMindEventDataOnNodeUpdated): void {
        debug('onNodeUpdated', mind.meta.name, event);
    }

    onNodeMoved(mind: JmMind, event: JmMindEventDataOnNodeMoved): void {
        debug('onNodeMoved', mind.meta.name, event);
    }

    onEdgeAdded(mind: JmMind, event: JmMindEventDataOnEdgeAdded): void {
        debug('onEdgeAdded', mind.meta.name, event);
    }

    onEdgeRemoved(mind: JmMind, event: JmMindEventDataOnEdgeRemoved): void {
        debug('onEdgeRemoved', mind.meta.name, event);
    }
}
