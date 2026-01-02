import assert from 'node:assert/strict';
import { describe, it, before } from 'node:test';
import { MindmapArranger } from '../../src/arranger/mindmap.ts';
import { JmMind } from '../../src/model/mind.ts';
import { JmNodeContent } from '../../src/model/node.content.ts';
import { JmNodeSide, JmNode } from '../../src/model/node.ts';
import { JmSize } from '../../src/common/index.ts';
import { initDom } from '../setup/jsdom.ts';

function setNodeSize(node: JmNode, text: string): void {
    const width = text.length * 8;
    node._data.layout.size = new JmSize(width, 38);
}

const TestData = {
    metadata: {
        author: 'hizzgdev@163.com',
        name: 'jsMind Mindmap',
        version: '1.0'
    },
    mindOptions: {
        rootNodeId: 'root'
    },
    layoutOptions: {
        parentChildSpace: 30,
        siblingSpace: 20,
        cousinSpace: 15,
        expanderSize: 13
    }};

describe('MindmapArranger', () => {
    before(() => {
        initDom();
    });

    describe('calculate', () => {
        it('should calculate layout for a simple mind map with root only', () => {
            const mind = new JmMind(TestData.metadata, TestData.mindOptions);
            setNodeSize(mind._root, mind._root.content.getText());
            const arranger = new MindmapArranger(TestData.layoutOptions);
            void arranger.calculate(mind);
            const rootNodeLayoutData = mind._root._data.layout;
            assert.strictEqual(rootNodeLayoutData.side, JmNodeSide.Center);
            assert.strictEqual(rootNodeLayoutData.visible, true);
            assert.strictEqual(rootNodeLayoutData.withDescendantsSize.width, 0);
            assert.strictEqual(rootNodeLayoutData.withDescendantsSize.height, 38);
            assert.strictEqual(rootNodeLayoutData.offsetToParent.x, 0);
            assert.strictEqual(rootNodeLayoutData.offsetToParent.y, 0);
        });

        it('should calculate layout for a mind map with nodes on side A', () => {
            const mind = new JmMind(TestData.metadata, TestData.mindOptions);
            const rootId = mind.root.id;
            setNodeSize(mind._root, mind._root.content.getText());
            // root_width = 14(text_length) * 8 = 112, root_height = 38
            assert.strictEqual(mind._root._data.layout.size.width, 112);

            const nodeA = mind.addNode(JmNodeContent.createText('Node 1'), { parentId: rootId, side: JmNodeSide.SideA });
            const nodeB = mind.addNode(JmNodeContent.createText('Node 2'), { parentId: rootId, side: JmNodeSide.SideA });
            setNodeSize(nodeA, 'Node 1');
            setNodeSize(nodeB, 'Node 2 - 2');
            const arranger = new MindmapArranger(TestData.layoutOptions);
            void arranger.calculate(mind);
            // 38 + 38 + 20(sibling space)
            assert.strictEqual(mind._root._data.layout.withDescendantsSize.height, 96);
            //
            assert.strictEqual(mind._root._data.layout.offsetToParent.x, 0);

            assert.strictEqual(nodeA._data.layout.withDescendantsSize.width, 0); // not calculated
            assert.strictEqual(nodeB._data.layout.withDescendantsSize.width, 0);

            assert.strictEqual(nodeA._data.layout.withDescendantsSize.height, 38);
            assert.strictEqual(nodeB._data.layout.withDescendantsSize.height, 38);

            // parent_width/2 + parent_children_space + expander_space(0 for first level) + expander_space
            // 112/2 + 30 + 0 + 13 = 99
            assert.strictEqual(nodeA._data.layout.offsetToParent.x, 99);
            assert.strictEqual(nodeB._data.layout.offsetToParent.x, 99);

            // base_offset_y = 0
            // offset_y = base_offset_y - max(children_total_height, node_height) / 2 = 0 - 38 / 2 = -19
            // offset_y += total_height / 2 = -19 + 96 / 2 = 29
            assert.strictEqual(nodeB._data.layout.offsetToParent.y, 29);
            // base_offset_y -= children_total_height + sibling_space = 0 - 38 - 20 = -58
            // offset_y = base_offset_y - children_total_height/ 2 = -58 - 38 / 2 = -77
            // offset_y += total_height / 2 = -77 + 96 / 2 = -29
            assert.strictEqual(nodeA._data.layout.offsetToParent.y, -29);

            assert.strictEqual(nodeA._data.layout.side, JmNodeSide.SideA);
            assert.strictEqual(nodeB._data.layout.side, JmNodeSide.SideA);

            assert.strictEqual(nodeA._data.layout.visible, true);
            assert.strictEqual(nodeB._data.layout.visible, true);
        });

        it('should calculate layout for a mind map with nodes on side B', () => {
            const mind = new JmMind(TestData.metadata, TestData.mindOptions);
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
            const arranger = new MindmapArranger(TestData.layoutOptions);
            void arranger.calculate(mind);
            assert.strictEqual(mind._root._data.layout.withDescendantsSize.height, 154);
            assert.strictEqual(nodes[0]._data.layout.withDescendantsSize.height, 38);
            assert.strictEqual(nodes[1]._data.layout.withDescendantsSize.height, 38);
            assert.strictEqual(nodes[2]._data.layout.withDescendantsSize.height, 38);

            assert.strictEqual(nodes[0]._data.layout.offsetToParent.x, -99);
            assert.strictEqual(nodes[1]._data.layout.offsetToParent.x, -99);
            assert.strictEqual(nodes[2]._data.layout.offsetToParent.x, -99);

            assert.strictEqual(nodes[0]._data.layout.offsetToParent.y, 58);
            assert.strictEqual(nodes[1]._data.layout.offsetToParent.y, 0);
            assert.strictEqual(nodes[2]._data.layout.offsetToParent.y, -58);
        });

        it('should calculate layout for a mind map with nodes on both sides and different heights', () => {
            const mind = new JmMind(TestData.metadata, TestData.mindOptions);
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
            const arranger = new MindmapArranger(TestData.layoutOptions);
            void arranger.calculate(mind);
            assert.strictEqual(mind._root._data.layout.withDescendantsSize.height, 212);
            assert.strictEqual(nodes[0]._data.layout.offsetToParent.x, 99);
            assert.strictEqual(nodes[1]._data.layout.offsetToParent.x, 99);
            assert.strictEqual(nodes[2]._data.layout.offsetToParent.x, 99);
            assert.strictEqual(nodes[3]._data.layout.offsetToParent.x, 99);
            assert.strictEqual(nodes[4]._data.layout.offsetToParent.x, -99);
            assert.strictEqual(nodes[5]._data.layout.offsetToParent.x, -99);
            assert.strictEqual(nodes[6]._data.layout.offsetToParent.x, -99);

            assert.strictEqual(nodes[0]._data.layout.offsetToParent.y, -87);
            assert.strictEqual(nodes[1]._data.layout.offsetToParent.y, -29);
            assert.strictEqual(nodes[2]._data.layout.offsetToParent.y, 29);
            assert.strictEqual(nodes[3]._data.layout.offsetToParent.y, 87);
            assert.strictEqual(nodes[4]._data.layout.offsetToParent.y, 58);
            assert.strictEqual(nodes[5]._data.layout.offsetToParent.y, 0);
            assert.strictEqual(nodes[6]._data.layout.offsetToParent.y, -58);
        });

        it('should calculate layout for a mind map with nodes on both sides and different heights and cousins', () => {
            const mind = new JmMind(TestData.metadata, TestData.mindOptions);
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
            const arranger = new MindmapArranger(TestData.layoutOptions);
            void arranger.calculate(mind);
            assert.strictEqual(mind._root._data.layout.withDescendantsSize.height, 242); // 212 + 15 * 2(cousin space)
        });

        it('should calculate layout for a mind map with nested nodes', () => {
            const mind = new JmMind(TestData.metadata, TestData.mindOptions);
            const rootId = mind.root.id;
            setNodeSize(mind._root, mind._root.content.getText());
            const node1 = mind.addNode(JmNodeContent.createText('Node 1'), { parentId: rootId, side: JmNodeSide.SideA });
            const node11 = mind.addNode(JmNodeContent.createText('Node 1.1'), { parentId: node1.id });
            const node12 = mind.addNode(JmNodeContent.createText('Node 1.2'), { parentId: node1.id });
            setNodeSize(node1, 'Node 1');
            setNodeSize(node11, 'Node 1.1');
            setNodeSize(node12, 'Node 1.2');
            const arranger = new MindmapArranger(TestData.layoutOptions);
            void arranger.calculate(mind);
            // TODO: add assertions
        });

        it('should calculate layout for a mind map with folded nodes', () => {
            const mind = new JmMind(TestData.metadata, TestData.mindOptions);
            const rootId = mind.root.id;
            setNodeSize(mind._root, mind._root.content.getText());
            const node1 = mind.addNode(JmNodeContent.createText('Node 1'), { parentId: rootId, side: JmNodeSide.SideA }, { folded: true });
            const node11 = mind.addNode(JmNodeContent.createText('Node 1.1'), { parentId: node1.id });
            const node12 = mind.addNode(JmNodeContent.createText('Node 1.2'), { parentId: node1.id });
            setNodeSize(node1, 'Node 1');
            setNodeSize(node11, 'Node 1.1');
            setNodeSize(node12, 'Node 1.2');
            const arranger = new MindmapArranger(TestData.layoutOptions);
            void arranger.calculate(mind);
            // TODO: add assertions
        });

        it('should calculate layout for a mind map with multiple levels and cousins', () => {
            const mind = new JmMind(TestData.metadata, TestData.mindOptions);
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
            const arranger = new MindmapArranger(TestData.layoutOptions);
            void arranger.calculate(mind);
            // TODO: add assertions
        });
    });

    describe('calculateBoundingBoxSize', () => {
        it('should calculate bounding box size for a simple mind map with root only', () => {
            const mind = new JmMind(TestData.metadata, TestData.mindOptions);
            setNodeSize(mind._root, mind._root.content.getText());
            const arranger = new MindmapArranger(TestData.layoutOptions);
            arranger.calculate(mind);
            void arranger.calculateMindBounds(mind);
            // TODO: add assertions
        });

        it('should calculate bounding box size for a mind map with nodes on both sides', () => {
            const mind = new JmMind(TestData.metadata, TestData.mindOptions);
            const rootId = mind.root.id;
            setNodeSize(mind._root, mind._root.content.getText());
            const nodeA = mind.addNode(JmNodeContent.createText('Node A'), { parentId: rootId, side: JmNodeSide.SideA });
            const nodeB = mind.addNode(JmNodeContent.createText('Node B'), { parentId: rootId, side: JmNodeSide.SideB });
            setNodeSize(nodeA, 'Node A');
            setNodeSize(nodeB, 'Node B');
            const arranger = new MindmapArranger(TestData.layoutOptions);
            arranger.calculate(mind);
            void arranger.calculateMindBounds(mind);
            // TODO: add assertions
        });

        it('should calculate bounding box size for a mind map with nested nodes', () => {
            const mind = new JmMind(TestData.metadata, TestData.mindOptions);
            const rootId = mind.root.id;
            setNodeSize(mind._root, mind._root.content.getText());
            const node1 = mind.addNode(JmNodeContent.createText('Node 1'), { parentId: rootId, side: JmNodeSide.SideA });
            const node11 = mind.addNode(JmNodeContent.createText('Node 1.1'), { parentId: node1.id });
            const node12 = mind.addNode(JmNodeContent.createText('Node 1.2'), { parentId: node1.id });
            setNodeSize(node1, 'Node 1');
            setNodeSize(node11, 'Node 1.1');
            setNodeSize(node12, 'Node 1.2');
            const arranger = new MindmapArranger(TestData.layoutOptions);
            arranger.calculate(mind);
            void arranger.calculateMindBounds(mind);
            // TODO: add assertions
        });

        it('should calculate bounding box size excluding invisible nodes', () => {
            const mind = new JmMind(TestData.metadata, TestData.mindOptions);
            const rootId = mind.root.id;
            setNodeSize(mind._root, mind._root.content.getText());
            const node1 = mind.addNode(JmNodeContent.createText('Node 1'), { parentId: rootId, side: JmNodeSide.SideA }, { folded: true });
            const node11 = mind.addNode(JmNodeContent.createText('Node 1.1'), { parentId: node1.id });
            const node12 = mind.addNode(JmNodeContent.createText('Node 1.2'), { parentId: node1.id });
            setNodeSize(node1, 'Node 1');
            setNodeSize(node11, 'Node 1.1');
            setNodeSize(node12, 'Node 1.2');
            const arranger = new MindmapArranger(TestData.layoutOptions);
            arranger.calculate(mind);
            void arranger.calculateMindBounds(mind);
            // TODO: add assertions
        });
    });

    describe('calculateNodePoint', () => {
        it('should calculate node point for root node', () => {
            const mind = new JmMind(TestData.metadata, TestData.mindOptions);
            setNodeSize(mind._root, mind._root.content.getText());
            const arranger = new MindmapArranger(TestData.layoutOptions);
            arranger.calculate(mind);
            const rootNode = mind._root;
            void arranger.calculateNodePoint(rootNode);
            // TODO: add assertions
        });

        it('should calculate node point for a node on side A', () => {
            const mind = new JmMind(TestData.metadata, TestData.mindOptions);
            const rootId = mind.root.id;
            setNodeSize(mind._root, mind._root.content.getText());
            const nodeA = mind.addNode(JmNodeContent.createText('Node A'), { parentId: rootId, side: JmNodeSide.SideA });
            setNodeSize(nodeA, 'Node A');
            const arranger = new MindmapArranger(TestData.layoutOptions);
            arranger.calculate(mind);
            void arranger.calculateNodePoint(nodeA);
            // TODO: add assertions
        });

        it('should calculate node point for a node on side B', () => {
            const mind = new JmMind(TestData.metadata, TestData.mindOptions);
            const rootId = mind.root.id;
            setNodeSize(mind._root, mind._root.content.getText());
            const nodeB = mind.addNode(JmNodeContent.createText('Node B'), { parentId: rootId, side: JmNodeSide.SideB });
            setNodeSize(nodeB, 'Node B');
            const arranger = new MindmapArranger(TestData.layoutOptions);
            arranger.calculate(mind);
            void arranger.calculateNodePoint(nodeB);
            // TODO: add assertions
        });

        it('should calculate node point for a nested node', () => {
            const mind = new JmMind(TestData.metadata, TestData.mindOptions);
            const rootId = mind.root.id;
            setNodeSize(mind._root, mind._root.content.getText());
            const node1 = mind.addNode(JmNodeContent.createText('Node 1'), { parentId: rootId, side: JmNodeSide.SideA });
            const node11 = mind.addNode(JmNodeContent.createText('Node 1.1'), { parentId: node1.id });
            setNodeSize(node1, 'Node 1');
            setNodeSize(node11, 'Node 1.1');
            const arranger = new MindmapArranger(TestData.layoutOptions);
            arranger.calculate(mind);
            void arranger.calculateNodePoint(node11);
            // TODO: add assertions
        });
    });

    describe('isNodeVisible', () => {
        it('should return true for visible root node', () => {
            const mind = new JmMind(TestData.metadata, TestData.mindOptions);
            const arranger = new MindmapArranger(TestData.layoutOptions);
            arranger.calculate(mind);
            const rootNode = mind._root;
            assert.strictEqual(arranger.isNodeVisible(rootNode), true);
        });

        it('should return true for visible child node', () => {
            const mind = new JmMind(TestData.metadata, TestData.mindOptions);
            const rootId = mind.root.id;
            const node1 = mind.addNode(JmNodeContent.createText('Node 1'), { parentId: rootId, side: JmNodeSide.SideA });
            const arranger = new MindmapArranger(TestData.layoutOptions);
            arranger.calculate(mind);
            assert.strictEqual(arranger.isNodeVisible(node1), true);
        });

        it('should return false for invisible node when parent is folded', () => {
            const mind = new JmMind(TestData.metadata, TestData.mindOptions);
            const rootId = mind.root.id;
            const node1 = mind.addNode(JmNodeContent.createText('Node 1'), { parentId: rootId, side: JmNodeSide.SideA }, { folded: true });
            const node11 = mind.addNode(JmNodeContent.createText('Node 1.1'), { parentId: node1.id });
            const arranger = new MindmapArranger(TestData.layoutOptions);
            arranger.calculate(mind);
            assert.strictEqual(arranger.isNodeVisible(node11), false);
        });

        it('should return false for invisible node when grandparent is folded', () => {
            const mind = new JmMind(TestData.metadata, TestData.mindOptions);
            const rootId = mind.root.id;
            const node1 = mind.addNode(JmNodeContent.createText('Node 1'), { parentId: rootId, side: JmNodeSide.SideA }, { folded: true });
            const node11 = mind.addNode(JmNodeContent.createText('Node 1.1'), { parentId: node1.id });
            const node111 = mind.addNode(JmNodeContent.createText('Node 1.1.1'), { parentId: node11.id });
            const arranger = new MindmapArranger(TestData.layoutOptions);
            arranger.calculate(mind);
            assert.strictEqual(arranger.isNodeVisible(node111), false);
        });
    });
});

