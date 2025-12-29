import type { LayoutOptions } from './common/option.ts';
import type { JmMind } from './model/jsmind.mind.ts';
import { JmNode, JmNodeSide } from './model/node.ts';
import type { JmView } from './view/index.ts';

export class JmLayout {

    private readonly nodeFilterForSideA = (node:JmNode)=>{return node.side === JmNodeSide.SideA;};

    private readonly nodeFilterForSideB = (node:JmNode)=>{return node.side === JmNodeSide.SideA;};

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
        const nodesOnSideB = rootNode.children.filter(this.nodeFilterForSideB).reverse();
        const heightA = this._calculateOffsetSide(nodesOnSideA);
        const heightB = this._calculateOffsetSide(nodesOnSideB);
        rootNode._data.layout.outerSize.height = Math.max(heightA, heightB);
    }

    private _calculateOffsetSide(nodes: JmNode[]): number {
        let offsetHeight = 0;
        let totalHeight = 0;
        nodes.forEach((node:JmNode)=>{
            let height = this._calculateOffsetSide(node.children);
            if(node.folded) {
                height = 0;
                this.recursiveUpdate(node, (n:JmNode)=>{n._data.layout.visible = false;});
            }
            height = Math.max(height, this.view.getViewData(node).size.height);
            offsetHeight += height;
            totalHeight += height;
        });
        return offsetHeight;
    }

    private recursiveUpdate(node: JmNode, func: (node: JmNode) => void) {
        func(node);
        node.children.forEach((child:JmNode)=>{
            this.recursiveUpdate(child, func);
        });
    }
}
