import { JmCache } from './common/cache.ts';
import { debug } from './common/debug.ts';
import { JmPoint, JmSize } from './common/index.ts';
import type { LayoutOptions } from './common/option.ts';
import type { JmMind } from './model/jsmind.mind.ts';
import { JmNode, JmNodeSide } from './model/node.ts';

export class JmLayout {

    private readonly nodeInSidePredicateA = (node: JmNode)=>{return node.side === JmNodeSide.SideA;};

    private readonly nodeInSidePredicateB = (node: JmNode)=>{return node.side === JmNodeSide.SideB;};

    private readonly nodeOutgoingPointCache = new JmCache<JmNode, JmPoint>((node: JmNode)=>node.id);

    private readonly nodeInComingPointCache = new JmCache<JmNode, JmPoint>((node: JmNode)=>node.id);

    private readonly nodeHasCousinsPredicate = (node: JmNode)=>{
        return node.children.length > 0 && (node.parent?.children?.length ?? 0) > 1;
    };

    options: LayoutOptions;

    constructor(options: LayoutOptions) {
        this.options = options;
    }

    /**
     * Layout the mind map.
     * @param _mind - The mind map data model
     * @returns The list of node IDs that need to be updated
     */
    calculate(mind: JmMind): string[] {
        this.nodeOutgoingPointCache.clear();
        this.nodeInComingPointCache.clear();

        const rootNode = mind._root;
        this._arrange(rootNode);
        this._markInvisibleNodes(rootNode);
        this._calculateOffset(rootNode);
        return [];
    }

    calculateBoundingBoxSize(mind: JmMind): JmSize {
        const rootNode = mind._root;
        const rootLayoutData = rootNode._data.layout;
        const rootMaxX = rootNode._data.size.width / 2;
        const rootMinX = 0 - rootMaxX;

        const outcomePointsX = Object.values(mind._nodes)
            .filter((node: JmNode)=>node._data.layout.visible)
            .map((node: JmNode)=>this.calculateNodeOutgoingPoint(node))
            .map((p: JmPoint)=>p.x);

        const minX = Math.min(...outcomePointsX);
        const maxX = Math.max(...outcomePointsX);

        const width = Math.max(rootMaxX, maxX) - Math.min(rootMinX, minX);
        const height = rootLayoutData.withDescendantsSize.height;

        this.printCacheStat();
        return new JmSize(width, height);
    }

    calculateNodePoint(node: JmNode): JmPoint {
        const size = node._data.size;
        const offset = this.calculateNodeIncomingPoint(node);
        const x = offset.x + (size.width * (node._data.layout.side - 1)) / 2;
        const y = offset.y - size.height / 2;
        const point = new JmPoint(x, y);
        // debug('calculateNodePoint', node.content.getText(), size, offset, point);
        return point;
    }

    calculateNodeOutgoingPoint(node: JmNode): JmPoint {
        const cached = this.nodeOutgoingPointCache.get(node);
        if(cached !== undefined) {
            return cached;
        }

        const layoutData = node._data.layout;
        const nodeSize = node._data.size;
        if(node.isRoot()) {
            return new JmPoint(0, 0);
        }
        const offset = this.calculateNodeIncomingPoint(node);
        const x = offset.x + (nodeSize.width + this.options.expanderSize) * layoutData.side;
        const y = offset.y;
        const point = new JmPoint(x, y);

        this.nodeOutgoingPointCache.put(node, point);
        return point;
    }

    calculateNodeIncomingPoint(node: JmNode): JmPoint {
        const cached = this.nodeInComingPointCache.get(node);
        if(cached !== undefined) {
            return cached;
        }

        const layoutData = node._data.layout;
        let x = layoutData.offsetToParent.x;
        let y = layoutData.offsetToParent.y;
        if(!node.isRoot()) {
            const parentOffset = this.calculateNodeIncomingPoint(node.parent!);
            x += parentOffset.x;
            y += parentOffset.y;
        }
        const point = new JmPoint(x, y);

        this.nodeInComingPointCache.put(node, point);
        return point;
    }

    isVisible(node: JmNode): boolean {
        return node._data.layout.visible;
    }

    printCacheStat(): void {
        debug('printCacheStat', this.options);
        this.nodeOutgoingPointCache.printStat('nodeOutcomePointCache');
        this.nodeInComingPointCache.printStat('nodeOffsetCache');
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
        this._traverseRecursively(node, (n: JmNode)=>{
            // debug('markInvisibleNodes', n.id, n.content.getText(), n.folded, n._data.layout.visible);
            if(n.folded) {
                this._traverseRecursively(n, (invisibleNode: JmNode)=>{invisibleNode._data.layout.visible = false;});
                return true;
            }
            return false;
        });
    }

    private _calculateOffset(rootNode: JmNode) {
        const nodesOnSideA = rootNode.children.filter(this.nodeInSidePredicateA).reverse();
        const nodesOnSideB = rootNode.children.filter(this.nodeInSidePredicateB);
        const heightRoot = rootNode._data.size.height;
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
            const parentSize = node.parent!._data.size;
            const parentLayout = node.parent!._data.layout;
            const layoutData = node._data.layout;
            const expanderSpace = !!isFirstLevelNodes ? 0 : this.options.expanderSize * layoutData.side;
            const cousinSpace = this.nodeHasCousinsPredicate(node) ? this.options.cousinSpace : 0;
            const height = Math.max(
                this._calculateNodesOffset(node.children, false),
                node._data.size.height
            ) + cousinSpace;
            layoutData.withDescendantsSize.height = height;
            layoutData.offsetToParent.y = offsetY - height / 2;
            // debug(`calculateNodesOffset for node ${node.content.getText()}`, offsetY, height);
            layoutData.offsetToParent.x = this.options.parentChildSpace * layoutData.side + parentSize.width * (parentLayout.side + layoutData.side) / 2 + expanderSpace;
            if(!node.isRoot()) {
                layoutData.offsetToParent.x += this.options.expanderSize * layoutData.side;
            }
            offsetY = offsetY - height - this.options.siblingSpace;
            totalHeight += height;
        });
        // debug('calculateNodesOffset totalHeight', totalHeight);
        if(visibleNodes.length > 1) {
            totalHeight += this.options.siblingSpace * (visibleNodes.length - 1);
        }
        const halfTotalHeight = totalHeight / 2;
        visibleNodes.forEach((node: JmNode)=>{
            node._data.layout.offsetToParent.y += halfTotalHeight;
            // debug('calculateNodesOffset2', node._data.layout);
        });
        return totalHeight;
    }


    /**
     * Traverse the node and its children recursively.
     * @param node - The node to start traversing from
     * @param func - The function to call for each node, return true to stop traversing
     */
    private _traverseRecursively(node: JmNode, func: (node: JmNode) => boolean | void): void {
        if(func(node) === true) {
            return;
        }
        node.children.forEach((child: JmNode)=>this._traverseRecursively(child, func));
    }
}
