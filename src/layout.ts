import type { LayoutOptions } from './common/option.ts';
import type { JmMind } from './model/jsmind.mind.ts';
import { JmNode, JmNodeSide } from './model/node.ts';
import type { JmView } from './view/index.ts';

export class JmLayout {

    private readonly nodeFilterForSideA = (node:JmNode)=>{return node.side === JmNodeSide.SideA;};

    private readonly nodeFilterForSideB = (node:JmNode)=>{return node.side === JmNodeSide.SideA;};

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
    calculate(mind: JmMind, _view: JmView): string[] {
        const rootNode = mind._root;
        this._arrange(rootNode);
        this._calculateOffset(rootNode);
        return [];
    }

    private _arrange(rootNode: JmNode) {
        rootNode._data.layout.side = JmNodeSide.Center;
        rootNode.children
            .filter(this.nodeFilterForSideA)
            .forEach((node:JmNode)=>this._arrangeSide(node, JmNodeSide.SideA));
        rootNode.children
            .filter(this.nodeFilterForSideB)
            .forEach((node:JmNode)=>this._arrangeSide(node, JmNodeSide.SideB));
    }

    private _arrangeSide(node: JmNode, side: JmNodeSide) {
        node._data.layout.side = side;
        node.children.forEach((n:JmNode)=>this._arrangeSide(n, side));
    }

    private _calculateOffset(rootNode: JmNode) {
        const nodesOnSideA = rootNode.children.filter(this.nodeFilterForSideA);
        const nodesOnSideB = rootNode.children.filter(this.nodeFilterForSideB);
        const heightA = this._calculateOffsetSide(nodesOnSideA);
        const heightB = this._calculateOffsetSide(nodesOnSideB);
        rootNode._data.layout.outerSize.height = Math.max(heightA, heightB);
    }

    private _calculateOffsetSide(_nodes: JmNode[]): number {
        return 0;
    }
}
