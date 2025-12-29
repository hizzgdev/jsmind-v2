import type { LayoutOptions } from './common/option.ts';
import type { JmMind } from './model/jsmind.mind.ts';
import { JmNode, JmNodeSide } from './model/node.ts';
import type { JmView } from './view/index.ts';


export class JmLayout {

    private readonly nodeInSidePredicateA = (node: JmNode)=>{return node.side === JmNodeSide.SideA;};

    private readonly nodeInSidePredicateB = (node: JmNode)=>{return node.side === JmNodeSide.SideA;};

    private readonly nodeHasCousinsPredicate = (node: JmNode)=>{
        return node.children.length > 0 && (node.parent?.children?.length ?? 0) > 1;
    };

    view: JmView;

    options: LayoutOptions;

    constructor(options: LayoutOptions, view: JmView) {
        this.options = options;
        this.view = view;
    }

    /**
     * Layout the mind map.
     * @param _mind - The mind map data model
     * @param _view - The view instance
     * @returns The list of node IDs that need to be updated
     */
    calculate(mind: JmMind): string[] {
        const rootNode = mind._root;
        this._arrange(rootNode);
        this._markInvisibleNodes(rootNode);
        this._calculateOffset(rootNode);
        return [];
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
        // console.log('markInvisibleNodes', this.view.getSize(node));
        this.traverseRecursively(node, (n: JmNode)=>{
            if(n.folded) {
                this.traverseRecursively(n, (invisibleNode: JmNode)=>{invisibleNode._data.layout.visible = false;});
                return true;
            }
            return false;
        });
    }

    private _calculateOffset(rootNode: JmNode) {
        const nodesOnSideA = rootNode.children.filter(this.nodeInSidePredicateA);
        const nodesOnSideB = rootNode.children.filter(this.nodeInSidePredicateB).reverse();
        const heightA = this._calculateNodesOffset(nodesOnSideA, true);
        const heightB = this._calculateNodesOffset(nodesOnSideB, true);
        rootNode._data.layout.outerSize.height = Math.max(heightA, heightB);
    }

    private _calculateNodesOffset(nodes: JmNode[], isFirstLevelNodes?: boolean): number {
        let offsetHeight = 0;
        let totalHeight = 0;
        const visibleNodes = nodes.filter((node: JmNode)=>node._data.layout.visible);
        visibleNodes.forEach((node: JmNode)=>{
            const parentSize = this.view.getSize(node.parent!);
            const parentLayout = node.parent!._data.layout;
            const layoutData = node._data.layout;
            const expanderSpace = !!isFirstLevelNodes ? 0 : this.options.expanderSize * layoutData.side;
            const cousinSpace = this.nodeHasCousinsPredicate(node) ? this.options.cousinSpace : 0;
            const height = Math.max(
                this._calculateNodesOffset(node.children, false),
                this.view.getSize(node).height
            ) + cousinSpace;
            layoutData.outerSize.height = height;
            layoutData.offset.y = offsetHeight - height / 2;
            layoutData.offset.x = this.options.parentChildSpace * layoutData.side + parentSize.width * (parentLayout.side + layoutData.side) / 2 + expanderSpace;
            offsetHeight += height + this.options.siblingSpace;
            totalHeight += height;
        });
        if(visibleNodes.length > 1) {
            totalHeight += this.options.siblingSpace * (visibleNodes.length - 1);
        }
        const halfTotalHeight = totalHeight / 2;
        visibleNodes.forEach((node: JmNode)=>{
            node._data.layout.offset.y += halfTotalHeight;
        });
        return totalHeight;
    }

    /**
     * Traverse the node and its children recursively.
     * @param node - The node to start traversing from
     * @param func - The function to call for each node, return true to stop traversing
     */
    private traverseRecursively(node: JmNode, func: (node: JmNode) => boolean | void): void {
        if(func(node) === true) {
            return;
        }
        node.children.forEach((child: JmNode)=>this.traverseRecursively(child, func));
    }
}
