import { JmCache } from '../common/cache.ts';
import { JmBounds, JmPoint, JmSize } from '../common/index.ts';
import type { LayoutOptions } from '../common/option.ts';
import type { JmMind } from '../model/mind.ts';
import { JmNode, JmNodeSide } from '../model/node.ts';
import type { Arranger } from './index.ts';

export class MindmapArranger implements Arranger {

    private readonly nodeInSidePredicateA = (node: JmNode)=>{return node.side === JmNodeSide.SideA;};

    private readonly nodeInSidePredicateB = (node: JmNode)=>{return node.side === JmNodeSide.SideB;};

    private readonly nodeHasCousinsPredicate = (node: JmNode)=>{
        return !node.folded && node.children.length > 0 && (node.parent?.children?.length ?? 0) > 1;
    };

    private readonly nodeInComingPointCache = new JmCache<JmNode, JmPoint>('nodeInComingPointCache', (node: JmNode)=>node.id);


    options: LayoutOptions;

    expanderSize: JmSize;

    constructor(options: LayoutOptions) {
        this.options = options;
        this.expanderSize = new JmSize(options.expanderSize, options.expanderSize);
    }

    /**
     * Calculate the layout of the mind map.
     * @param mind - The mind map data model
     */
    calculate(mind: JmMind): void {
        this.nodeInComingPointCache.clear();

        const rootNode = mind._root;
        this._arrange(rootNode);
        this._markInvisibleNodes(rootNode);
        this._calculateOffset(rootNode);
    }

    calculateMindBounds(mind: JmMind): JmBounds {
        const rootLayoutData = mind._root._data.layout;
        const rootMaxX: number = rootLayoutData.size.width / 2;
        const rootMinX: number = 0 - rootMaxX;

        const outcomePointsX: number[] = Object.values(mind._nodes)
            .filter((node: JmNode)=>node._data.layout.visible)
            .map((node: JmNode)=>this.calculateNodeOutgoingPoint(node))
            .map((p: JmPoint)=>p.x);

        const minX: number = Math.min(...outcomePointsX, rootMinX);
        const maxX: number = Math.max(...outcomePointsX, rootMaxX);

        const width = maxX - minX;
        const height = rootLayoutData.withDescendantsSize.height;

        const size = new JmSize(width, height);
        const center = new JmPoint((minX + maxX) / 2, 0);

        return new JmBounds(center, size);
    }

    calculateNodePoint(node: JmNode): JmPoint {
        const size = node._data.layout.size;
        const incomingPoint = this.calculateNodeIncomingPoint(node);
        const offsetToIncomingPoint = new JmPoint(
            (size.width * (node._data.layout.side - 1)) / 2,
            -size.height / 2
        );
        return incomingPoint.offset(offsetToIncomingPoint);
    }

    calculateNodeExpanderPoint(node: JmNode): JmPoint {
        if(node.isRoot()) {
            return JmPoint.Zero;
        }
        const outgoingPoint = this.calculateNodeOutgoingPoint(node);
        const offsetToOutgoingPoint = new JmPoint(
            this.options.expanderSize * (node._data.layout.side + 1) / -2,
            - this.options.expanderSize / 2);
        return outgoingPoint.offset(offsetToOutgoingPoint);
    }

    calculateNodeOutgoingPoint(node: JmNode): JmPoint {
        if(node.isRoot()) {
            return JmPoint.Zero;
        }
        const incomingPoint = this.calculateNodeIncomingPoint(node);
        const offsetToIncomingPointX: number = (node._data.layout.size.width + this.options.expanderSize) * node._data.layout.side;
        const offsetToIncomingPoint = new JmPoint(offsetToIncomingPointX, 0);
        return incomingPoint.offset(offsetToIncomingPoint);
    }

    calculateNodeIncomingPoint(node: JmNode): JmPoint {
        if(node.isRoot()) {
            return JmPoint.Zero;
        }
        return this.nodeInComingPointCache.wrap(node, ()=>{
            const parentIncomingPoint = this.calculateNodeIncomingPoint(node.parent!);
            return parentIncomingPoint.offset(node._data.layout.offsetToParent);
        });
    }

    isNodeVisible(node: JmNode): boolean {
        return node._data.layout.visible;
    }

    recordNodeSize(node: JmNode, size: JmSize): void {
        node._data.layout.size = size;
    }

    printCacheStats(): void {
        this.nodeInComingPointCache.printStats();
    }

    private _arrange(rootNode: JmNode) {
        rootNode._data.layout.side = JmNodeSide.Center;
        rootNode.children
            .filter(this.nodeInSidePredicateA)
            .forEach((node: JmNode)=>this._arrangeSide(node, JmNodeSide.SideA));
        rootNode.children
            .filter(this.nodeInSidePredicateB)
            .forEach((node: JmNode)=>this._arrangeSide(node, JmNodeSide.SideB));
    }

    private _arrangeSide(node: JmNode, side: JmNodeSide) {
        node._data.layout.side = side;
        node.children.forEach((n: JmNode)=>this._arrangeSide(n, side));
    }

    private _markInvisibleNodes(node: JmNode) {
        if(node.folded) {
            this._applyToDescendants(node, (n: JmNode)=>{n._data.layout.visible = false;});
        }else{
            this._applyToDescendants(node, (n: JmNode)=>{this._markInvisibleNodes(n);});
        }
    }

    private _calculateOffset(rootNode: JmNode) {
        const nodesOnSideA = rootNode.children.filter(this.nodeInSidePredicateA);
        const nodesOnSideB = rootNode.children.filter(this.nodeInSidePredicateB);
        const heightRoot = rootNode._data.layout.size.height;
        const heightA = this._calculateNodesOffset(nodesOnSideA, true);
        const heightB = this._calculateNodesOffset(nodesOnSideB, true);
        // debug('calculateOffset', heightRoot, heightA, heightB);
        rootNode._data.layout.withDescendantsSize.height = Math.max(heightRoot, heightA, heightB);
    }

    /**
     * Calculate the offset for the nodes, from bottom to top.
     * @param nodes - The nodes to calculate the offset for, the first item should be the bottom node
     * @param isFirstLevelNodes - Whether the nodes are the first level nodes
     * @returns The total height of the nodes
     */
    private _calculateNodesOffset(nodes: JmNode[], isFirstLevelNodes?: boolean): number {
        let offsetY = 0;
        let totalHeight = 0;
        const visibleNodes = nodes.filter((node: JmNode)=>node._data.layout.visible);
        // debug('visibleNodes', visibleNodes.length, isFirstLevelNodes);
        // debug('calculateNodesOffset options', this.options);
        visibleNodes.forEach((node: JmNode)=>{
            const parentLayout = node.parent!._data.layout;
            const layoutData = node._data.layout;
            const expanderSpace = !!isFirstLevelNodes ? 0 : this.options.expanderSize * layoutData.side;
            const cousinSpace = this.nodeHasCousinsPredicate(node) ? this.options.cousinSpace : 0;
            const height = Math.max(
                this._calculateNodesOffset(node.children, false),
                layoutData.size.height
            ) + cousinSpace;
            layoutData.withDescendantsSize.height = height;
            layoutData.offsetToParent.y = offsetY + height / 2;
            // debug(`calculateNodesOffset for node ${node.content.getText()}`, offsetY, height);
            layoutData.offsetToParent.x = this.options.parentChildSpace * layoutData.side + parentLayout.size.width * (parentLayout.side + layoutData.side) / 2 + expanderSpace;
            offsetY = offsetY + height + this.options.siblingSpace;
            totalHeight += height;
        });
        if(visibleNodes.length > 1) {
            totalHeight += this.options.siblingSpace * (visibleNodes.length - 1);
        }
        const halfTotalHeight = totalHeight / 2;
        visibleNodes.forEach((node: JmNode)=>{
            node._data.layout.offsetToParent.y -= halfTotalHeight;
        });
        return totalHeight;
    }


    /**
     * Traverse the node and its children recursively.
     * @param nodes - The nodes to start traversing from
     * @param func - The function to call for each node
     */
    private _applyToDescendants(node: JmNode, func: (n: JmNode) => void): void {
        node.children.forEach((n: JmNode)=>{
            func(n);
            this._applyToDescendants(n, func);
        });
    }
}
