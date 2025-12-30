import assert from 'node:assert/strict';
import { describe, it, before } from 'node:test';
import { JmLayout } from '../src/layout.ts';
import { DEFAULT_OPTIONS } from '../src/common/option.ts';
import { JmMind } from '../src/model/jsmind.mind.ts';
import { JmNodeContent } from '../src/model/jsmind.node.content.ts';
import { JmNodeSide, JmNode } from '../src/model/node.ts';
import { JmSize } from '../src/common/index.ts';
import { initDom } from './setup/jsdom.ts';

function setNodeSize(node: JmNode, text: string): void {
    const width = text.length * 8;
    node._data.size = new JmSize(width, 38);
}

describe('JmLayout', () => {
    before(() => {
        initDom();
    });

    describe('calculate', () => {
        it('should calculate layout for a simple mind map with root only', () => {
            const mind = new JmMind();
            setNodeSize(mind._root, mind._root.content.getText());
            const layout = new JmLayout(DEFAULT_OPTIONS.layout);
            void layout.calculate(mind);
            const rootNodeLayoutData = mind._root._data.layout;
            assert.strictEqual(rootNodeLayoutData.side, JmNodeSide.Center);
            assert.strictEqual(rootNodeLayoutData.visible, true);
            assert.strictEqual(rootNodeLayoutData.outerSize.width, 0);
            assert.strictEqual(rootNodeLayoutData.outerSize.height, 38);
            assert.strictEqual(rootNodeLayoutData.offset.x, 0);
            assert.strictEqual(rootNodeLayoutData.offset.y, 0);
        });

        it('should calculate layout for a mind map with nodes on side A', () => {
            const mind = new JmMind();
            const rootId = mind.root.id;
            setNodeSize(mind._root, mind._root.content.getText());
            const nodeA = mind.addNode(JmNodeContent.createText('Node 1'), { parentId: rootId, side: JmNodeSide.SideA });
            const nodeB = mind.addNode(JmNodeContent.createText('Node 2'), { parentId: rootId, side: JmNodeSide.SideA });
            setNodeSize(nodeA, 'Node 1');
            setNodeSize(nodeB, 'Node 2 - 2');
            const layout = new JmLayout(DEFAULT_OPTIONS.layout);
            void layout.calculate(mind);
            assert.strictEqual(mind._root._data.layout.outerSize.height, 96); // 38 + 38 + 20(sibling space)
            assert.strictEqual(nodeA._data.layout.outerSize.height, 38);
            assert.strictEqual(nodeB._data.layout.outerSize.height, 38);

            assert.strictEqual(nodeA._data.layout.offset.x, 99); // ?
            assert.strictEqual(nodeB._data.layout.offset.x, 99);

            assert.strictEqual(nodeA._data.layout.offset.y, -29); // ?
            assert.strictEqual(nodeB._data.layout.offset.y, 29);

            assert.strictEqual(nodeA._data.layout.side, JmNodeSide.SideA);
            assert.strictEqual(nodeB._data.layout.side, JmNodeSide.SideA);

            assert.strictEqual(nodeA._data.layout.visible, true);
            assert.strictEqual(nodeB._data.layout.visible, true);
        });

        it('should calculate layout for a mind map with nodes on side B', () => {
            const mind = new JmMind();
            const rootId = mind.root.id;
            setNodeSize(mind._root, mind._root.content.getText());
            const nodes = [
                mind.addNode(JmNodeContent.createText('Node 1'), { parentId: rootId, side: JmNodeSide.SideB }),
                mind.addNode(JmNodeContent.createText('Node 2'), { parentId: rootId, side: JmNodeSide.SideB }),
                mind.addNode(JmNodeContent.createText('Node 3'), { parentId: rootId, side: JmNodeSide.SideB }),
            ];
            nodes.forEach((node: JmNode)=>{
                setNodeSize(node, node.content.getText());
            });
            const layout = new JmLayout(DEFAULT_OPTIONS.layout);
            void layout.calculate(mind);
            assert.strictEqual(mind._root._data.layout.outerSize.height, 154);
            assert.strictEqual(nodes[0]._data.layout.outerSize.height, 38);
            assert.strictEqual(nodes[1]._data.layout.outerSize.height, 38);
            assert.strictEqual(nodes[2]._data.layout.outerSize.height, 38);

            assert.strictEqual(nodes[0]._data.layout.offset.x, -99); // ?
            assert.strictEqual(nodes[1]._data.layout.offset.x, -99);
            assert.strictEqual(nodes[2]._data.layout.offset.x, -99);

            assert.strictEqual(nodes[0]._data.layout.offset.y, 58);
            assert.strictEqual(nodes[1]._data.layout.offset.y, 0);
            assert.strictEqual(nodes[2]._data.layout.offset.y, -58);
        });

        it('should calculate layout for a mind map with nodes on both sides and different heights', () => {
            const mind = new JmMind();
            const rootId = mind.root.id;
            setNodeSize(mind._root, mind._root.content.getText());
            const nodes = [
                mind.addNode(JmNodeContent.createText('Node 1'), { parentId: rootId, side: JmNodeSide.SideA }),
                mind.addNode(JmNodeContent.createText('Node 2'), { parentId: rootId, side: JmNodeSide.SideA }),
                mind.addNode(JmNodeContent.createText('Node 3'), { parentId: rootId, side: JmNodeSide.SideA }),
                mind.addNode(JmNodeContent.createText('Node 4'), { parentId: rootId, side: JmNodeSide.SideA }),
                mind.addNode(JmNodeContent.createText('Node 5'), { parentId: rootId, side: JmNodeSide.SideB }),
                mind.addNode(JmNodeContent.createText('Node 6'), { parentId: rootId, side: JmNodeSide.SideB }),
                mind.addNode(JmNodeContent.createText('Node 7'), { parentId: rootId, side: JmNodeSide.SideB }),
            ];
            nodes.forEach((node: JmNode)=>{
                setNodeSize(node, node.content.getText());
            });
            const layout = new JmLayout(DEFAULT_OPTIONS.layout);
            void layout.calculate(mind);
            assert.strictEqual(mind._root._data.layout.outerSize.height, 212);
        });

        it('should calculate layout for a mind map with nodes on both sides and different heights and cousins', () => {
            const mind = new JmMind();
            const rootId = mind.root.id;
            setNodeSize(mind._root, mind._root.content.getText());
            const nodes = [
                mind.addNode(JmNodeContent.createText('Node 1'), { parentId: rootId, side: JmNodeSide.SideA }, { nodeId: 'node1' }),
                mind.addNode(JmNodeContent.createText('Node 1.1'), { parentId: 'node1' }),
                mind.addNode(JmNodeContent.createText('Node 1.2'), { parentId: 'node1' }),
                mind.addNode(JmNodeContent.createText('Node 2'), { parentId: rootId, side: JmNodeSide.SideA }, { nodeId: 'node2' }),
                mind.addNode(JmNodeContent.createText('Node 2.1'), { parentId: 'node2' }),
                mind.addNode(JmNodeContent.createText('Node 2.2'), { parentId: 'node2' }),
                mind.addNode(JmNodeContent.createText('Node 5'), { parentId: rootId, side: JmNodeSide.SideB }),
                mind.addNode(JmNodeContent.createText('Node 6'), { parentId: rootId, side: JmNodeSide.SideB }),
                mind.addNode(JmNodeContent.createText('Node 7'), { parentId: rootId, side: JmNodeSide.SideB }),
                mind.addNode(JmNodeContent.createText('Node 8'), { parentId: rootId, side: JmNodeSide.SideB }),
            ];
            nodes.forEach((node: JmNode)=>{
                setNodeSize(node, node.content.getText());
            });
            const layout = new JmLayout(DEFAULT_OPTIONS.layout);
            void layout.calculate(mind);
            assert.strictEqual(mind._root._data.layout.outerSize.height, 242); // ?
        });

        it('should calculate layout for a mind map with nested nodes', () => {
            const mind = new JmMind();
            const rootId = mind.root.id;
            setNodeSize(mind._root, mind._root.content.getText());
            const node1 = mind.addNode(JmNodeContent.createText('Node 1'), { parentId: rootId, side: JmNodeSide.SideA });
            const node11 = mind.addNode(JmNodeContent.createText('Node 1.1'), { parentId: node1.id });
            const node12 = mind.addNode(JmNodeContent.createText('Node 1.2'), { parentId: node1.id });
            setNodeSize(node1, 'Node 1');
            setNodeSize(node11, 'Node 1.1');
            setNodeSize(node12, 'Node 1.2');
            const layout = new JmLayout(DEFAULT_OPTIONS.layout);
            void layout.calculate(mind);
            // TODO: add assertions
        });

        it('should calculate layout for a mind map with folded nodes', () => {
            const mind = new JmMind();
            const rootId = mind.root.id;
            setNodeSize(mind._root, mind._root.content.getText());
            const node1 = mind.addNode(JmNodeContent.createText('Node 1'), { parentId: rootId, side: JmNodeSide.SideA }, { folded: true });
            const node11 = mind.addNode(JmNodeContent.createText('Node 1.1'), { parentId: node1.id });
            const node12 = mind.addNode(JmNodeContent.createText('Node 1.2'), { parentId: node1.id });
            setNodeSize(node1, 'Node 1');
            setNodeSize(node11, 'Node 1.1');
            setNodeSize(node12, 'Node 1.2');
            const layout = new JmLayout(DEFAULT_OPTIONS.layout);
            void layout.calculate(mind);
            // TODO: add assertions
        });

        it('should calculate layout for a mind map with multiple levels and cousins', () => {
            const mind = new JmMind();
            const rootId = mind.root.id;
            setNodeSize(mind._root, mind._root.content.getText());
            const node1 = mind.addNode(JmNodeContent.createText('Node 1'), { parentId: rootId, side: JmNodeSide.SideA });
            const node2 = mind.addNode(JmNodeContent.createText('Node 2'), { parentId: rootId, side: JmNodeSide.SideA });
            const node11 = mind.addNode(JmNodeContent.createText('Node 1.1'), { parentId: node1.id });
            const node21 = mind.addNode(JmNodeContent.createText('Node 2.1'), { parentId: node2.id });
            setNodeSize(node1, 'Node 1');
            setNodeSize(node2, 'Node 2');
            setNodeSize(node11, 'Node 1.1');
            setNodeSize(node21, 'Node 2.1');
            const layout = new JmLayout(DEFAULT_OPTIONS.layout);
            void layout.calculate(mind);
            // TODO: add assertions
        });
    });

    describe('calculateBoundingBoxSize', () => {
        it('should calculate bounding box size for a simple mind map with root only', () => {
            const mind = new JmMind();
            setNodeSize(mind._root, mind._root.content.getText());
            const layout = new JmLayout(DEFAULT_OPTIONS.layout);
            layout.calculate(mind);
            void layout.calculateBoundingBoxSize(mind);
            // TODO: add assertions
        });

        it('should calculate bounding box size for a mind map with nodes on both sides', () => {
            const mind = new JmMind();
            const rootId = mind.root.id;
            setNodeSize(mind._root, mind._root.content.getText());
            const nodeA = mind.addNode(JmNodeContent.createText('Node A'), { parentId: rootId, side: JmNodeSide.SideA });
            const nodeB = mind.addNode(JmNodeContent.createText('Node B'), { parentId: rootId, side: JmNodeSide.SideB });
            setNodeSize(nodeA, 'Node A');
            setNodeSize(nodeB, 'Node B');
            const layout = new JmLayout(DEFAULT_OPTIONS.layout);
            layout.calculate(mind);
            void layout.calculateBoundingBoxSize(mind);
            // TODO: add assertions
        });

        it('should calculate bounding box size for a mind map with nested nodes', () => {
            const mind = new JmMind();
            const rootId = mind.root.id;
            setNodeSize(mind._root, mind._root.content.getText());
            const node1 = mind.addNode(JmNodeContent.createText('Node 1'), { parentId: rootId, side: JmNodeSide.SideA });
            const node11 = mind.addNode(JmNodeContent.createText('Node 1.1'), { parentId: node1.id });
            const node12 = mind.addNode(JmNodeContent.createText('Node 1.2'), { parentId: node1.id });
            setNodeSize(node1, 'Node 1');
            setNodeSize(node11, 'Node 1.1');
            setNodeSize(node12, 'Node 1.2');
            const layout = new JmLayout(DEFAULT_OPTIONS.layout);
            layout.calculate(mind);
            void layout.calculateBoundingBoxSize(mind);
            // TODO: add assertions
        });

        it('should calculate bounding box size excluding invisible nodes', () => {
            const mind = new JmMind();
            const rootId = mind.root.id;
            setNodeSize(mind._root, mind._root.content.getText());
            const node1 = mind.addNode(JmNodeContent.createText('Node 1'), { parentId: rootId, side: JmNodeSide.SideA }, { folded: true });
            const node11 = mind.addNode(JmNodeContent.createText('Node 1.1'), { parentId: node1.id });
            const node12 = mind.addNode(JmNodeContent.createText('Node 1.2'), { parentId: node1.id });
            setNodeSize(node1, 'Node 1');
            setNodeSize(node11, 'Node 1.1');
            setNodeSize(node12, 'Node 1.2');
            const layout = new JmLayout(DEFAULT_OPTIONS.layout);
            layout.calculate(mind);
            void layout.calculateBoundingBoxSize(mind);
            // TODO: add assertions
        });
    });

    describe('calculateNodePoint', () => {
        it('should calculate node point for root node', () => {
            const mind = new JmMind();
            setNodeSize(mind._root, mind._root.content.getText());
            const layout = new JmLayout(DEFAULT_OPTIONS.layout);
            layout.calculate(mind);
            const rootNode = mind._root;
            void layout.calculateNodePoint(rootNode);
            // TODO: add assertions
        });

        it('should calculate node point for a node on side A', () => {
            const mind = new JmMind();
            const rootId = mind.root.id;
            setNodeSize(mind._root, mind._root.content.getText());
            const nodeA = mind.addNode(JmNodeContent.createText('Node A'), { parentId: rootId, side: JmNodeSide.SideA });
            setNodeSize(nodeA, 'Node A');
            const layout = new JmLayout(DEFAULT_OPTIONS.layout);
            layout.calculate(mind);
            void layout.calculateNodePoint(nodeA);
            // TODO: add assertions
        });

        it('should calculate node point for a node on side B', () => {
            const mind = new JmMind();
            const rootId = mind.root.id;
            setNodeSize(mind._root, mind._root.content.getText());
            const nodeB = mind.addNode(JmNodeContent.createText('Node B'), { parentId: rootId, side: JmNodeSide.SideB });
            setNodeSize(nodeB, 'Node B');
            const layout = new JmLayout(DEFAULT_OPTIONS.layout);
            layout.calculate(mind);
            void layout.calculateNodePoint(nodeB);
            // TODO: add assertions
        });

        it('should calculate node point for a nested node', () => {
            const mind = new JmMind();
            const rootId = mind.root.id;
            setNodeSize(mind._root, mind._root.content.getText());
            const node1 = mind.addNode(JmNodeContent.createText('Node 1'), { parentId: rootId, side: JmNodeSide.SideA });
            const node11 = mind.addNode(JmNodeContent.createText('Node 1.1'), { parentId: node1.id });
            setNodeSize(node1, 'Node 1');
            setNodeSize(node11, 'Node 1.1');
            const layout = new JmLayout(DEFAULT_OPTIONS.layout);
            layout.calculate(mind);
            void layout.calculateNodePoint(node11);
            // TODO: add assertions
        });
    });

    describe('isVisible', () => {
        it('should return true for visible root node', () => {
            const mind = new JmMind();
            const layout = new JmLayout(DEFAULT_OPTIONS.layout);
            layout.calculate(mind);
            const rootNode = mind._root;
            assert.strictEqual(layout.isVisible(rootNode), true);
        });

        it('should return true for visible child node', () => {
            const mind = new JmMind();
            const rootId = mind.root.id;
            const node1 = mind.addNode(JmNodeContent.createText('Node 1'), { parentId: rootId, side: JmNodeSide.SideA });
            const layout = new JmLayout(DEFAULT_OPTIONS.layout);
            layout.calculate(mind);
            assert.strictEqual(layout.isVisible(node1), true);
        });

        it('should return false for invisible node when parent is folded', () => {
            const mind = new JmMind();
            const rootId = mind.root.id;
            const node1 = mind.addNode(JmNodeContent.createText('Node 1'), { parentId: rootId, side: JmNodeSide.SideA }, { folded: true });
            const node11 = mind.addNode(JmNodeContent.createText('Node 1.1'), { parentId: node1.id });
            const layout = new JmLayout(DEFAULT_OPTIONS.layout);
            layout.calculate(mind);
            assert.strictEqual(layout.isVisible(node11), false);
        });

        it('should return false for invisible node when grandparent is folded', () => {
            const mind = new JmMind();
            const rootId = mind.root.id;
            const node1 = mind.addNode(JmNodeContent.createText('Node 1'), { parentId: rootId, side: JmNodeSide.SideA }, { folded: true });
            const node11 = mind.addNode(JmNodeContent.createText('Node 1.1'), { parentId: node1.id });
            const node111 = mind.addNode(JmNodeContent.createText('Node 1.1.1'), { parentId: node11.id });
            const layout = new JmLayout(DEFAULT_OPTIONS.layout);
            layout.calculate(mind);
            assert.strictEqual(layout.isVisible(node111), false);
        });
    });
});

