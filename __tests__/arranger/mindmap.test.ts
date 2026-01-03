import assert from 'node:assert/strict';
import { describe, it, before } from 'node:test';
import { MindmapArranger } from '../../src/arranger/mindmap.ts';
import { JmMind } from '../../src/model/mind.ts';
import { JmNodeContent } from '../../src/model/node.content.ts';
import { JmNodeSide, JmNode } from '../../src/model/node.ts';
import { JmSize } from '../../src/common/index.ts';
import { initDom } from '../setup/jsdom.ts';

function setNodeSize(...nodes: JmNode[]): void {
    nodes.forEach((node: JmNode)=>{
        node._data.layout.size = TestData.defaultNodeSize;
    });
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
        expanderSize: 10
    },
    defaultNodeSize: new JmSize(80, 40)
};

function createTestMind(...nodeIds: string[]): JmMind {
    const mind = new JmMind(TestData.metadata, TestData.mindOptions);
    mind._root._data.layout.size = TestData.defaultNodeSize;
    nodeIds.forEach((nId: string)=>{
        const side = nId.startsWith('A') ? JmNodeSide.SideA : JmNodeSide.SideB;
        const parentId = nId.length > 3 ? nId.slice(0, -2) : mind._root.id;
        const nodeId = nId.slice(0, -1);
        const folded = nId.endsWith('F');
        const node = mind.addNode(
            JmNodeContent.createText(nId),
            { parentId: parentId, side: side },
            { nodeId: nodeId, folded: folded }
        );
        node._data.layout.size = TestData.defaultNodeSize;
    });
    return mind;
}

describe('MindmapArranger', () => {
    before(() => {
        initDom();
    });

    describe('check result of createTestMind', () => {
        it('should create a test mind map with the given node ids', () => {
            const mind = createTestMind('A1C', 'A2F', 'A3C', 'A11C', 'A12C', 'A121C', 'A122C', 'B1F', 'B2C', 'B3C', 'B11F', 'B12C', 'B121C', 'B122C');
            const root = mind._root;
            const nodeA1 = mind._getNodeById('A1');
            const nodeA2 = mind._getNodeById('A2');
            const nodeA3 = mind._getNodeById('A3');
            const nodeA11 = mind._getNodeById('A11');
            const nodeA12 = mind._getNodeById('A12');
            const nodeA121 = mind._getNodeById('A121');
            const nodeA122 = mind._getNodeById('A122');
            const nodeB1 = mind._getNodeById('B1');
            const nodeB2 = mind._getNodeById('B2');
            const nodeB3 = mind._getNodeById('B3');
            const nodeB11 = mind._getNodeById('B11');
            const nodeB12 = mind._getNodeById('B12');
            const nodeB121 = mind._getNodeById('B121');
            const nodeB122 = mind._getNodeById('B122');
            assert.strictEqual(nodeA1.parent!.id, root.id);
            assert.strictEqual(nodeA2.parent!.id, root.id);
            assert.strictEqual(nodeA3.parent!.id, root.id);
            assert.strictEqual(nodeA11.parent!.id, nodeA1.id);
            assert.strictEqual(nodeA12.parent!.id, nodeA1.id);
            assert.strictEqual(nodeA121.parent!.id, nodeA12.id);
            assert.strictEqual(nodeA122.parent!.id, nodeA12.id);
            assert.strictEqual(nodeB1.parent!.id, root.id);
            assert.strictEqual(nodeB2.parent!.id, root.id);
            assert.strictEqual(nodeB3.parent!.id, root.id);
            assert.strictEqual(nodeB11.parent!.id, nodeB1.id);
            assert.strictEqual(nodeB12.parent!.id, nodeB1.id);
            assert.strictEqual(nodeB121.parent!.id, nodeB12.id);
            assert.strictEqual(nodeB122.parent!.id, nodeB12.id);
            assert.strictEqual(root.children.length, 6);
            assert.strictEqual(nodeA1.children.length, 2);
            assert.strictEqual(nodeA11.children.length, 0);
            assert.strictEqual(nodeA12.children.length, 2);
            assert.strictEqual(nodeA121.children.length, 0);
            assert.strictEqual(nodeA122.children.length, 0);
            assert.strictEqual(nodeB1.children.length, 2);
            assert.strictEqual(nodeB11.children.length, 0);
            assert.strictEqual(nodeB12.children.length, 2);
            assert.strictEqual(nodeB121.children.length, 0);
            assert.strictEqual(nodeB122.children.length, 0);
            assert.strictEqual(nodeA1.side, JmNodeSide.SideA);
            assert.strictEqual(nodeA2.side, JmNodeSide.SideA);
            assert.strictEqual(nodeA3.side, JmNodeSide.SideA);
            assert.strictEqual(nodeA11.side, JmNodeSide.SideA);
            assert.strictEqual(nodeA12.side, JmNodeSide.SideA);
            assert.strictEqual(nodeA121.side, JmNodeSide.SideA);
            assert.strictEqual(nodeA122.side, JmNodeSide.SideA);
            assert.strictEqual(nodeB1.side, JmNodeSide.SideB);
            assert.strictEqual(nodeB2.side, JmNodeSide.SideB);
            assert.strictEqual(nodeB3.side, JmNodeSide.SideB);
            assert.strictEqual(nodeB11.side, JmNodeSide.SideB);
            assert.strictEqual(nodeB12.side, JmNodeSide.SideB);
            assert.strictEqual(nodeB121.side, JmNodeSide.SideB);
            assert.strictEqual(nodeB122.side, JmNodeSide.SideB);
            assert.strictEqual(nodeA1.folded, false);
            assert.strictEqual(nodeA2.folded, true);
            assert.strictEqual(nodeA3.folded, false);
            assert.strictEqual(nodeA11.folded, false);
            assert.strictEqual(nodeA12.folded, false);
            assert.strictEqual(nodeA121.folded, false);
            assert.strictEqual(nodeA122.folded, false);
            assert.strictEqual(nodeB1.folded, true);
            assert.strictEqual(nodeB2.folded, false);
            assert.strictEqual(nodeB3.folded, false);
            assert.strictEqual(nodeB11.folded, true);
            assert.strictEqual(nodeB12.folded, false);
            assert.strictEqual(nodeB121.folded, false);
            assert.strictEqual(nodeB122.folded, false);
        });
    });

    describe('calculate', () => {
        it('should calculate layout for a simple mind map with root only', () => {
            const mind = createTestMind();
            const arranger = new MindmapArranger(TestData.layoutOptions);
            void arranger.calculate(mind);
            const rootNodeLayoutData = mind._root._data.layout;
            assert.strictEqual(rootNodeLayoutData.side, JmNodeSide.Center);
            assert.strictEqual(rootNodeLayoutData.visible, true);
            assert.strictEqual(rootNodeLayoutData.withDescendantsSize.width, 0);
            assert.strictEqual(rootNodeLayoutData.withDescendantsSize.height, 40);
            assert.strictEqual(rootNodeLayoutData.offsetToParent.x, 0);
            assert.strictEqual(rootNodeLayoutData.offsetToParent.y, 0);
        });

        it('should calculate layout for a mind map with nodes on side A', () => {
            const mind = createTestMind('A1C', 'A2C');
            const arranger = new MindmapArranger(TestData.layoutOptions);
            arranger.calculate(mind);
            const nodeA = mind._getNodeById('A1');
            const nodeB = mind._getNodeById('A2');
            // 40 + 40 + 20(sibling space)
            assert.strictEqual(mind._root._data.layout.withDescendantsSize.height, 100);
            assert.strictEqual(mind._root._data.layout.offsetToParent.x, 0);
            assert.strictEqual(nodeA._data.layout.withDescendantsSize.width, 0);
            assert.strictEqual(nodeB._data.layout.withDescendantsSize.width, 0);
            assert.strictEqual(nodeA._data.layout.withDescendantsSize.height, 40);
            assert.strictEqual(nodeB._data.layout.withDescendantsSize.height, 40);
            // parent_width/2 + parent_children_space + expander_space(0 for first level)
            // 80/2 + 30 + 0 = 80
            assert.strictEqual(nodeA._data.layout.offsetToParent.x, 70);
            assert.strictEqual(nodeB._data.layout.offsetToParent.x, 70);

            // base_offset_y = 0
            // offset_y = base_offset_y - max(children_total_height, node_height) / 2 = 0 - 40 / 2 = -20
            // offset_y += total_height / 2 = -20 + 100 / 2 = 30
            assert.strictEqual(nodeB._data.layout.offsetToParent.y, 30);
            // base_offset_y -= children_total_height + sibling_space = 0 - 40 - 20 = -60
            // offset_y = base_offset_y - children_total_height/ 2 = -60 - 40 / 2 = -80
            // offset_y += total_height / 2 = -80 + 100 / 2 = -30
            assert.strictEqual(nodeA._data.layout.offsetToParent.y, -30);

            assert.strictEqual(nodeA._data.layout.side, JmNodeSide.SideA);
            assert.strictEqual(nodeB._data.layout.side, JmNodeSide.SideA);

            assert.strictEqual(nodeA._data.layout.visible, true);
            assert.strictEqual(nodeB._data.layout.visible, true);
        });

        it('should calculate layout for a mind map with nodes on side B', () => {
            const mind = createTestMind('B1C', 'B2C', 'B3C');
            const arranger = new MindmapArranger(TestData.layoutOptions);
            arranger.calculate(mind);
            const nodeB1 = mind._getNodeById('B1');
            const nodeB2 = mind._getNodeById('B2');
            const nodeB3 = mind._getNodeById('B3');
            assert.strictEqual(mind._root._data.layout.withDescendantsSize.height, 160);
            assert.strictEqual(nodeB1._data.layout.withDescendantsSize.height, 40);
            assert.strictEqual(nodeB2._data.layout.withDescendantsSize.height, 40);
            assert.strictEqual(nodeB3._data.layout.withDescendantsSize.height, 40);

            assert.strictEqual(nodeB1._data.layout.offsetToParent.x, -70);
            assert.strictEqual(nodeB2._data.layout.offsetToParent.x, -70);
            assert.strictEqual(nodeB3._data.layout.offsetToParent.x, -70);

            assert.strictEqual(nodeB1._data.layout.offsetToParent.y, -60);
            assert.strictEqual(nodeB2._data.layout.offsetToParent.y, 0);
            assert.strictEqual(nodeB3._data.layout.offsetToParent.y, 60);
        });

        it('should calculate layout for a mind map with nodes on both sides and different heights', () => {
            const mind = createTestMind('A1C', 'A2C', 'A3C', 'A4C', 'B1C', 'B2C', 'B3C');
            const arranger = new MindmapArranger(TestData.layoutOptions);
            arranger.calculate(mind);
            const nodeA1 = mind._getNodeById('A1');
            const nodeA2 = mind._getNodeById('A2');
            const nodeA3 = mind._getNodeById('A3');
            const nodeA4 = mind._getNodeById('A4');
            const nodeB1 = mind._getNodeById('B1');
            const nodeB2 = mind._getNodeById('B2');
            const nodeB3 = mind._getNodeById('B3');
            assert.strictEqual(mind._root._data.layout.withDescendantsSize.height, 220);
            assert.strictEqual(nodeA1._data.layout.offsetToParent.x, 70);
            assert.strictEqual(nodeA2._data.layout.offsetToParent.x, 70);
            assert.strictEqual(nodeA3._data.layout.offsetToParent.x, 70);
            assert.strictEqual(nodeA4._data.layout.offsetToParent.x, 70);
            assert.strictEqual(nodeB1._data.layout.offsetToParent.x, -70);
            assert.strictEqual(nodeB2._data.layout.offsetToParent.x, -70);
            assert.strictEqual(nodeB3._data.layout.offsetToParent.x, -70);

            assert.strictEqual(nodeA1._data.layout.offsetToParent.y, -90);
            assert.strictEqual(nodeA2._data.layout.offsetToParent.y, -30);
            assert.strictEqual(nodeA3._data.layout.offsetToParent.y, 30);
            assert.strictEqual(nodeA4._data.layout.offsetToParent.y, 90);
            assert.strictEqual(nodeB1._data.layout.offsetToParent.y, -60);
            assert.strictEqual(nodeB2._data.layout.offsetToParent.y, 0);
            assert.strictEqual(nodeB3._data.layout.offsetToParent.y, 60);
        });

        it('should calculate layout for a mind map with nodes on both sides and different heights and cousins', () => {
            const mind = createTestMind('A1C', 'A2C', 'A11C', 'A12C', 'A21C', 'A22C', 'B1C', 'B2C', 'B3C', 'B4C');
            const arranger = new MindmapArranger(TestData.layoutOptions);
            void arranger.calculate(mind);
            const nodeA1 = mind._getNodeById('A1');
            const nodeA2 = mind._getNodeById('A2');
            const nodeA11 = mind._getNodeById('A11');
            const nodeA12 = mind._getNodeById('A12');
            const nodeA21 = mind._getNodeById('A21');
            const nodeA22 = mind._getNodeById('A22');
            const nodeB1 = mind._getNodeById('B1');
            const nodeB2 = mind._getNodeById('B2');
            const nodeB3 = mind._getNodeById('B3');
            const nodeB4 = mind._getNodeById('B4');
            assert.strictEqual(mind._root._data.layout.withDescendantsSize.height, 250); // 220 + 15 * 2(cousin space)
            assert.strictEqual(nodeA1._data.layout.offsetToParent.x, 70);
            assert.strictEqual(nodeA2._data.layout.offsetToParent.x, 70);
            // parent width + parent child space + expander
            assert.strictEqual(nodeA11._data.layout.offsetToParent.x, 120);
            assert.strictEqual(nodeA12._data.layout.offsetToParent.x, 120);
            assert.strictEqual(nodeA21._data.layout.offsetToParent.x, 120);
            assert.strictEqual(nodeA22._data.layout.offsetToParent.x, 120);
            assert.strictEqual(nodeB1._data.layout.offsetToParent.x, -70);
            assert.strictEqual(nodeB2._data.layout.offsetToParent.x, -70);
            assert.strictEqual(nodeB3._data.layout.offsetToParent.x, -70);
            assert.strictEqual(nodeB4._data.layout.offsetToParent.x, -70);

            // cousin_space(15) = cousin_space_on_top(7.5) + cousin_space_on_bottom(7.5)
            assert.strictEqual(nodeA1._data.layout.offsetToParent.y, -67.5);
            assert.strictEqual(nodeA2._data.layout.offsetToParent.y, 67.5);
            assert.strictEqual(nodeA11._data.layout.offsetToParent.y, -30);
            assert.strictEqual(nodeA12._data.layout.offsetToParent.y, 30);
            assert.strictEqual(nodeA21._data.layout.offsetToParent.y, -30);
            assert.strictEqual(nodeA22._data.layout.offsetToParent.y, 30);
            assert.strictEqual(nodeB1._data.layout.offsetToParent.y, -90);
            assert.strictEqual(nodeB2._data.layout.offsetToParent.y, -30);
            assert.strictEqual(nodeB3._data.layout.offsetToParent.y, 30);
            assert.strictEqual(nodeB4._data.layout.offsetToParent.y, 90);
        });

        it('should calculate layout for a mind map with folded nodes', () => {
            const mind = createTestMind('A1F', 'A2F', 'A11C', 'A12C', 'A21C', 'A22C', 'A3C');
            const arranger = new MindmapArranger(TestData.layoutOptions);
            void arranger.calculate(mind);
            const nodeA1 = mind._getNodeById('A1');
            const nodeA2 = mind._getNodeById('A2');
            const nodeA3 = mind._getNodeById('A3');
            assert.strictEqual(mind._root._data.layout.withDescendantsSize.height, 160);
            assert.strictEqual(nodeA1._data.layout.withDescendantsSize.height, 40);
            assert.strictEqual(nodeA2._data.layout.withDescendantsSize.height, 40);
            assert.strictEqual(nodeA3._data.layout.withDescendantsSize.height, 40);

            assert.strictEqual(nodeA1._data.layout.offsetToParent.x, 70);
            assert.strictEqual(nodeA2._data.layout.offsetToParent.x, 70);
            assert.strictEqual(nodeA3._data.layout.offsetToParent.x, 70);

            assert.strictEqual(nodeA1._data.layout.offsetToParent.y, -60);
            assert.strictEqual(nodeA2._data.layout.offsetToParent.y, 0);
            assert.strictEqual(nodeA3._data.layout.offsetToParent.y, 60);
        });

        it('should calculate layout for a mind map with multiple levels and cousins', () => {
            const mind = createTestMind('A1C', 'A2C', 'A11C', 'A12C', 'A21C', 'A22C', 'A3C');
            const arranger = new MindmapArranger(TestData.layoutOptions);
            void arranger.calculate(mind);
            const nodeA1 = mind._getNodeById('A1');
            const nodeA2 = mind._getNodeById('A2');
            const nodeA11 = mind._getNodeById('A11');
            const nodeA12 = mind._getNodeById('A12');
            const nodeA21 = mind._getNodeById('A21');
            const nodeA22 = mind._getNodeById('A22');
            const nodeA3 = mind._getNodeById('A3');
            assert.strictEqual(mind._root._data.layout.withDescendantsSize.height, 310);
            assert.strictEqual(nodeA1._data.layout.offsetToParent.x, 70);
            assert.strictEqual(nodeA2._data.layout.offsetToParent.x, 70);
            assert.strictEqual(nodeA3._data.layout.offsetToParent.x, 70);
            assert.strictEqual(nodeA11._data.layout.offsetToParent.x, 120);
            assert.strictEqual(nodeA12._data.layout.offsetToParent.x, 120);
            assert.strictEqual(nodeA21._data.layout.offsetToParent.x, 120);
            assert.strictEqual(nodeA22._data.layout.offsetToParent.x, 120);
            assert.strictEqual(nodeA1._data.layout.withDescendantsSize.height, 115);
            assert.strictEqual(nodeA2._data.layout.withDescendantsSize.height, 115);
            assert.strictEqual(nodeA3._data.layout.withDescendantsSize.height, 40);
            assert.strictEqual(nodeA11._data.layout.withDescendantsSize.height, 40);
            assert.strictEqual(nodeA12._data.layout.withDescendantsSize.height, 40);
            assert.strictEqual(nodeA21._data.layout.withDescendantsSize.height, 40);
            assert.strictEqual(nodeA22._data.layout.withDescendantsSize.height, 40);
        });
    });

    describe('calculateMindBounds', () => {
        it('should calculate mind bounds for a simple mind map with root only', () => {
            const mind = createTestMind();
            const arranger = new MindmapArranger(TestData.layoutOptions);
            arranger.calculate(mind);
            const bounds = arranger.calculateMindBounds(mind);
            assert.strictEqual(bounds.center.x, 0);
            assert.strictEqual(bounds.center.y, 0);
            assert.strictEqual(bounds.size.width, 80);
            assert.strictEqual(bounds.size.height, 40);
        });

        it('should calculate mind bounds for a mind map with nodes on both sides', () => {
            const mind = createTestMind('A1C', 'B1C');
            const arranger = new MindmapArranger(TestData.layoutOptions);
            arranger.calculate(mind);
            const bounds = arranger.calculateMindBounds(mind);
            assert.strictEqual(bounds.center.x, 0);
            assert.strictEqual(bounds.center.y, 0);
            assert.strictEqual(bounds.size.width, 320);
            assert.strictEqual(bounds.size.height, 40);
        });

        it('should calculate mind bounds for a mind map with nodes on side A', () => {
            const mind = createTestMind('A1C', 'A11C');
            const arranger = new MindmapArranger(TestData.layoutOptions);
            arranger.calculate(mind);
            const bounds = arranger.calculateMindBounds(mind);
            assert.strictEqual(bounds.center.x, 120);
            assert.strictEqual(bounds.center.y, 0);
            assert.strictEqual(bounds.size.width, 320);
            assert.strictEqual(bounds.size.height, 40);
        });

        it('should calculate mind bounds for a mind map with nested nodes on side B', () => {
            const mind = createTestMind('B1C', 'B11C', 'B12C', 'B2C');
            const arranger = new MindmapArranger(TestData.layoutOptions);
            arranger.calculate(mind);
            const bounds = arranger.calculateMindBounds(mind);
            assert.strictEqual(bounds.center.x, -120);
            assert.strictEqual(bounds.center.y, 0);
            assert.strictEqual(bounds.size.width, 320);
            assert.strictEqual(bounds.size.height, 175);
        });

        it('should calculate mind bounds excluding invisible nodes', () => {
            const mind = createTestMind('A1F', 'A11C', 'A12C', 'A2F', 'A21C', 'A22C', 'A221C', 'A222C');
            const arranger = new MindmapArranger(TestData.layoutOptions);
            arranger.calculate(mind);
            const bounds = arranger.calculateMindBounds(mind);
            assert.strictEqual(bounds.center.x, 60);
            assert.strictEqual(bounds.center.y, 0);
            assert.strictEqual(bounds.size.width, 200);
            assert.strictEqual(bounds.size.height, 100);
        });
    });

    describe('calculateNodePoint', () => {
        it('should calculate node point for root node', () => {
            const mind = new JmMind(TestData.metadata, TestData.mindOptions);
            setNodeSize(mind._root);
            const arranger = new MindmapArranger(TestData.layoutOptions);
            arranger.calculate(mind);
            const rootNode = mind._root;
            void arranger.calculateNodePoint(rootNode);
            // TODO: add assertions
        });

        it('should calculate node point for a node on side A', () => {
            const mind = new JmMind(TestData.metadata, TestData.mindOptions);
            const rootId = mind.root.id;
            const nodeA = mind.addNode(JmNodeContent.createText('Node A'), { parentId: rootId, side: JmNodeSide.SideA });
            setNodeSize(mind._root, nodeA);
            const arranger = new MindmapArranger(TestData.layoutOptions);
            arranger.calculate(mind);
            void arranger.calculateNodePoint(nodeA);
            // TODO: add assertions
        });

        it('should calculate node point for a node on side B', () => {
            const mind = new JmMind(TestData.metadata, TestData.mindOptions);
            const rootId = mind.root.id;
            const nodeB = mind.addNode(JmNodeContent.createText('Node B'), { parentId: rootId, side: JmNodeSide.SideB });
            setNodeSize(mind._root, nodeB);
            const arranger = new MindmapArranger(TestData.layoutOptions);
            arranger.calculate(mind);
            void arranger.calculateNodePoint(nodeB);
            // TODO: add assertions
        });

        it('should calculate node point for a nested node', () => {
            const mind = new JmMind(TestData.metadata, TestData.mindOptions);
            const rootId = mind.root.id;
            const node1 = mind.addNode(JmNodeContent.createText('Node 1'), { parentId: rootId, side: JmNodeSide.SideA });
            const node11 = mind.addNode(JmNodeContent.createText('Node 1.1'), { parentId: node1.id });
            setNodeSize(mind._root, node1, node11);
            const arranger = new MindmapArranger(TestData.layoutOptions);
            arranger.calculate(mind);
            void arranger.calculateNodePoint(node11);
            // TODO: add assertions
        });
    });

    describe('isNodeVisible', () => {
        it('should return true for visible root node', () => {
            const mind = createTestMind();
            const arranger = new MindmapArranger(TestData.layoutOptions);
            arranger.calculate(mind);
            assert.strictEqual(arranger.isNodeVisible(mind._root), true);
        });

        it('should return true for visible child node', () => {
            const mind = createTestMind('A1C');
            const arranger = new MindmapArranger(TestData.layoutOptions);
            arranger.calculate(mind);
            const nodeA1 = mind._getNodeById('A1');
            assert.strictEqual(arranger.isNodeVisible(nodeA1), true);
        });

        it('should return false for invisible node when parent is folded', () => {
            const mind = createTestMind('A1F', 'A11C', 'A2C');
            const arranger = new MindmapArranger(TestData.layoutOptions);
            arranger.calculate(mind);
            const nodeA1 = mind._getNodeById('A1');
            const nodeA11 = mind._getNodeById('A11');
            assert.strictEqual(arranger.isNodeVisible(nodeA1), true);
            assert.strictEqual(arranger.isNodeVisible(nodeA11), false);
        });

        it('should return false for invisible node when grandparent is folded', () => {
            const mind = createTestMind('A1F', 'A11C', 'A12C', 'A111C', 'A1111C', 'A2C', 'A21F', 'A22C', 'A211C', 'A212C');
            const arranger = new MindmapArranger(TestData.layoutOptions);
            arranger.calculate(mind);
            const nodeA1 = mind._getNodeById('A1');
            const nodeA11 = mind._getNodeById('A11');
            const nodeA12 = mind._getNodeById('A12');
            const nodeA111 = mind._getNodeById('A111');
            const nodeA1111 = mind._getNodeById('A1111');
            const nodeA2 = mind._getNodeById('A2');
            const nodeA21 = mind._getNodeById('A21');
            const nodeA22 = mind._getNodeById('A22');
            const nodeA211 = mind._getNodeById('A211');
            const nodeA212 = mind._getNodeById('A212');
            assert.strictEqual(arranger.isNodeVisible(nodeA1), true);
            assert.strictEqual(arranger.isNodeVisible(nodeA11), false);
            assert.strictEqual(arranger.isNodeVisible(nodeA12), false);
            assert.strictEqual(arranger.isNodeVisible(nodeA111), false);
            assert.strictEqual(arranger.isNodeVisible(nodeA1111), false);
            assert.strictEqual(arranger.isNodeVisible(nodeA2), true);
            assert.strictEqual(arranger.isNodeVisible(nodeA21), true);
            assert.strictEqual(arranger.isNodeVisible(nodeA22), true);
            assert.strictEqual(arranger.isNodeVisible(nodeA211), false);
            assert.strictEqual(arranger.isNodeVisible(nodeA212), false);
        });
    });
});

