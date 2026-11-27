import type { Arranger } from '../arranger/index.ts';
import { MindmapArranger } from '../arranger/mindmap.ts';
import type { JmMind } from '../model/mind.ts';
import type { JmNode } from '../model/data/node.ts';
import type { JmView } from '../view/index.ts';
import { JmMindObserver } from '../model/mind-observer.ts';
import { debug } from '../common/debug.ts';
import type { JmMindEventDataOnNodeRemoved, JmMindEventDataOnNodeUpdated, JmMindEventDataOnNodeMoved, JmMindEventDataOnEdgeAdded, JmMindEventDataOnEdgeRemoved, JmMindEventDataOnNodeAdded } from '../model/event/data.ts';

export class JmMindChangeCoordinator extends JmMindObserver {

    private readonly arranger: Arranger;

    private readonly view: JmView;

    /**
     * The map this coordinator is rendering, or null while none is open.
     *
     * @remarks
     * A repaint is deferred to the next frame, so it needs to know whether the
     * map it was scheduled for is still the one on screen. Without that, a style
     * change followed by `close()` in the same turn would paint the closed map's
     * nodes back onto the canvas a frame later.
     */
    private activeMind: JmMind | null = null;

    /** Nodes whose style changed and have not been repainted yet, per map. */
    private readonly pendingStyleNodes = new Map<JmMind, Set<JmNode>>();

    /** Whether a repaint has already been scheduled for the next frame. */
    private repaintScheduled = false;

    constructor(arranger: Arranger, view: JmView) {
        super();
        this.arranger = arranger;
        this.view = view;
    }

    async onMindMapOpened(mind: JmMind): Promise<void> {
        this.activeMind = mind;
        // The whole map is about to be painted, so a repaint waiting for the
        // next frame is redundant and must not run against a map that is being
        // rebuilt underneath it.
        this.pendingStyleNodes.clear();
        // The map is painted from scratch, so nothing an earlier rendering left
        // on these nodes may survive: `createAndMeasure` trusts an element and a
        // size it finds, and an open is exactly the moment to stop trusting
        // them. This is what makes reopening a map show the style it has now
        // rather than the style it had when it was first rendered.
        this.view.clear(mind);
        // Before measuring, not after: a node's measured size depends on the
        // theme's padding, font size and line height. Applying it later would
        // lay the map out to the previous theme's geometry.
        this.view.applyTheme(mind);
        await this.view.measureNodeSizes(mind);
        this.arranger.calculate(mind);
        await this.view.settle(mind);
        if (this.arranger instanceof MindmapArranger) {
            this.arranger.printCacheStats();
        }
    }

    onMindMapClosed(mind: JmMind): void {
        // A closed map must leave no painted nodes and no per-node cache behind:
        // the elements would sit on the canvas under the next map opened here,
        // and the cache would stop the next open from painting those nodes at
        // all. The observer goes too, or a closed map would keep repainting this
        // view.
        this.activeMind = null;
        this.pendingStyleNodes.clear();
        mind.observerManager.removeObserver(this);
        this.view.clear(mind);
    }

    async onNodeAdded(mind: JmMind, event: JmMindEventDataOnNodeAdded): Promise<void> {
        debug('onNodeAdded', mind.meta.name, event);
        await this.view.measureNodeSize(event.node);
        this.arranger.calculate(mind);
        await this.view.settle(mind);
        if (this.arranger instanceof MindmapArranger) {
            this.arranger.printCacheStats();
        }
    }

    onNodeRemoved(mind: JmMind, event: JmMindEventDataOnNodeRemoved): void {
        debug('onNodeRemoved', mind.meta.name, event);
        // The model has already dropped the node and its subtree, so `clear` -
        // which walks the model - can never reach what was painted for them.
        // Releasing them here, while the event still names them, is what keeps a
        // deleted node off the canvas: otherwise deleting a node and then
        // reopening the map (the documented way to refresh a view) leaves a
        // ghost sitting beside the new rendering.
        const pending = this.pendingStyleNodes.get(mind);
        if (pending) {
            const removedIds = new Set(event.removedNodeIds);
            pending.forEach((node: JmNode)=>{
                if (removedIds.has(node.id)) {
                    pending.delete(node);
                }
            });
            if (pending.size === 0) {
                this.pendingStyleNodes.delete(mind);
            }
        }
        this.view.releaseNode(event.node);
    }

    onNodeUpdated(mind: JmMind, event: JmMindEventDataOnNodeUpdated): void {
        // No debug() here, unlike the other handlers: a style change is the one
        // node event a caller makes in a loop (recolouring a whole map), and that
        // dump prints the entire node graph per call - enough to bury the console
        // it is meant to help.
        // Only a style change is repaintable on its own. Everything else the
        // model can report on a node - content, folded, side - still needs a
        // full pass, and that is what `open` is for.
        if (event.property !== 'style') {
            return;
        }
        let pending = this.pendingStyleNodes.get(mind);
        if (!pending) {
            pending = new Set<JmNode>();
            this.pendingStyleNodes.set(mind, pending);
        }
        pending.add(event.node);
        this._scheduleStyleRepaint();
    }

    /**
     * Repaints every node whose style changed, once, on the next frame.
     *
     * @remarks
     * Deferred rather than painted per event: the callers say "recolour this
     * map" by writing a style on each node in a loop, and repainting per write
     * would re-arrange and settle the whole map once per node. One pass per
     * frame also means the repeat writes that land in the same turn cost
     * nothing, while a later write still gets its own pass.
     *
     * The colours themselves are only half of it: a style can change a node's
     * box (font size, border width), so the nodes are re-measured and the map
     * re-arranged - the neighbours of a node that grew have to move out of its
     * way.
     *
     * @private
     */
    private _scheduleStyleRepaint(): void {
        if (this.repaintScheduled) {
            return;
        }
        this.repaintScheduled = true;
        requestAnimationFrame(() => {
            void this._repaintStyledNodes();
        });
    }

    /**
     * Runs one repaint pass over the nodes collected since the last frame.
     *
     * @private
     */
    private async _repaintStyledNodes(): Promise<void> {
        this.repaintScheduled = false;
        const mind = this.activeMind;
        const pending = mind ? this.pendingStyleNodes.get(mind) : undefined;
        // Anything else queued here belongs to a map that is not the one on
        // screen - the events of a map that was just replaced can still arrive,
        // because they reach this method through a timer `close` cannot cancel.
        this.pendingStyleNodes.clear();
        if (!mind || !pending || pending.size === 0) {
            return;
        }
        const nodes = [...pending];
        await this.view.refreshNodesStyle(nodes);
        // Measuring waited a frame, and a frame is long enough for the map to be
        // closed or replaced. The repaint drops what it cannot paint any more,
        // so laying the map out and settling it here would place the nodes of a
        // map that is gone - under, or over, whatever the view shows now.
        if (this.activeMind !== mind) {
            return;
        }
        this.arranger.calculate(mind);
        await this.view.settle(mind);
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
