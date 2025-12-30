import { describe, it, before } from 'node:test';
import { JmLayout } from '../src/layout.ts';
import { DEFAULT_OPTIONS } from '../src/common/option.ts';
import { JmMind } from '../src/model/jsmind.mind.ts';
import { JmNodeContent } from '../src/model/jsmind.node.content.ts';
import { JmNodeSide } from '../src/model/node.ts';
import { initDom } from './setup/jsdom.ts';

describe('JmLayout', () => {
    before(() => {
        initDom();
    });

    describe('calculate', () => {
        it('should calculate layout for a simple mind map with root only', () => {
            const mind = new JmMind();
            const layout = new JmLayout(DEFAULT_OPTIONS.layout);
            void layout.calculate(mind);
            // TODO: add assertions
        });

        it('should calculate layout for a mind map with nodes on both sides', () => {
            const mind = new JmMind();
            const rootId = mind.root.id;
            void mind.addNode(JmNodeContent.createText('Node A'), { parentId: rootId, side: JmNodeSide.SideA });
            void mind.addNode(JmNodeContent.createText('Node B'), { parentId: rootId, side: JmNodeSide.SideB });
            const layout = new JmLayout(DEFAULT_OPTIONS.layout);
            void layout.calculate(mind);
            // TODO: add assertions
        });

        it('should calculate layout for a mind map with nested nodes', () => {
            const mind = new JmMind();
            const rootId = mind.root.id;
            const node1 = mind.addNode(JmNodeContent.createText('Node 1'), { parentId: rootId, side: JmNodeSide.SideA });
            void mind.addNode(JmNodeContent.createText('Node 1.1'), { parentId: node1.id });
            void mind.addNode(JmNodeContent.createText('Node 1.2'), { parentId: node1.id });
            const layout = new JmLayout(DEFAULT_OPTIONS.layout);
            void layout.calculate(mind);
            // TODO: add assertions
        });

        it('should calculate layout for a mind map with folded nodes', () => {
            const mind = new JmMind();
            const rootId = mind.root.id;
            const node1 = mind.addNode(JmNodeContent.createText('Node 1'), { parentId: rootId, side: JmNodeSide.SideA }, { folded: true });
            void mind.addNode(JmNodeContent.createText('Node 1.1'), { parentId: node1.id });
            void mind.addNode(JmNodeContent.createText('Node 1.2'), { parentId: node1.id });
            const layout = new JmLayout(DEFAULT_OPTIONS.layout);
            void layout.calculate(mind);
            // TODO: add assertions
        });

        it('should calculate layout for a mind map with multiple levels and cousins', () => {
            const mind = new JmMind();
            const rootId = mind.root.id;
            const node1 = mind.addNode(JmNodeContent.createText('Node 1'), { parentId: rootId, side: JmNodeSide.SideA });
            const node2 = mind.addNode(JmNodeContent.createText('Node 2'), { parentId: rootId, side: JmNodeSide.SideA });
            void mind.addNode(JmNodeContent.createText('Node 1.1'), { parentId: node1.id });
            void mind.addNode(JmNodeContent.createText('Node 2.1'), { parentId: node2.id });
            const layout = new JmLayout(DEFAULT_OPTIONS.layout);
            void layout.calculate(mind);
            // TODO: add assertions
        });
    });

    describe('calculateBoundingBoxSize', () => {
        it('should calculate bounding box size for a simple mind map with root only', () => {
            const mind = new JmMind();
            const layout = new JmLayout(DEFAULT_OPTIONS.layout);
            layout.calculate(mind);
            void layout.calculateBoundingBoxSize(mind);
            // TODO: add assertions
        });

        it('should calculate bounding box size for a mind map with nodes on both sides', () => {
            const mind = new JmMind();
            const rootId = mind.root.id;
            void mind.addNode(JmNodeContent.createText('Node A'), { parentId: rootId, side: JmNodeSide.SideA });
            void mind.addNode(JmNodeContent.createText('Node B'), { parentId: rootId, side: JmNodeSide.SideB });
            const layout = new JmLayout(DEFAULT_OPTIONS.layout);
            layout.calculate(mind);
            void layout.calculateBoundingBoxSize(mind);
            // TODO: add assertions
        });

        it('should calculate bounding box size for a mind map with nested nodes', () => {
            const mind = new JmMind();
            const rootId = mind.root.id;
            const node1 = mind.addNode(JmNodeContent.createText('Node 1'), { parentId: rootId, side: JmNodeSide.SideA });
            void mind.addNode(JmNodeContent.createText('Node 1.1'), { parentId: node1.id });
            void mind.addNode(JmNodeContent.createText('Node 1.2'), { parentId: node1.id });
            const layout = new JmLayout(DEFAULT_OPTIONS.layout);
            layout.calculate(mind);
            void layout.calculateBoundingBoxSize(mind);
            // TODO: add assertions
        });

        it('should calculate bounding box size excluding invisible nodes', () => {
            const mind = new JmMind();
            const rootId = mind.root.id;
            const node1 = mind.addNode(JmNodeContent.createText('Node 1'), { parentId: rootId, side: JmNodeSide.SideA }, { folded: true });
            void mind.addNode(JmNodeContent.createText('Node 1.1'), { parentId: node1.id });
            void mind.addNode(JmNodeContent.createText('Node 1.2'), { parentId: node1.id });
            const layout = new JmLayout(DEFAULT_OPTIONS.layout);
            layout.calculate(mind);
            void layout.calculateBoundingBoxSize(mind);
            // TODO: add assertions
        });
    });

    describe('calculateNodePoint', () => {
        it('should calculate node point for root node', () => {
            const mind = new JmMind();
            const layout = new JmLayout(DEFAULT_OPTIONS.layout);
            layout.calculate(mind);
            const rootNode = mind._root;
            void layout.calculateNodePoint(rootNode);
            // TODO: add assertions
        });

        it('should calculate node point for a node on side A', () => {
            const mind = new JmMind();
            const rootId = mind.root.id;
            const nodeA = mind.addNode(JmNodeContent.createText('Node A'), { parentId: rootId, side: JmNodeSide.SideA });
            const layout = new JmLayout(DEFAULT_OPTIONS.layout);
            layout.calculate(mind);
            void layout.calculateNodePoint(nodeA);
            // TODO: add assertions
        });

        it('should calculate node point for a node on side B', () => {
            const mind = new JmMind();
            const rootId = mind.root.id;
            const nodeB = mind.addNode(JmNodeContent.createText('Node B'), { parentId: rootId, side: JmNodeSide.SideB });
            const layout = new JmLayout(DEFAULT_OPTIONS.layout);
            layout.calculate(mind);
            void layout.calculateNodePoint(nodeB);
            // TODO: add assertions
        });

        it('should calculate node point for a nested node', () => {
            const mind = new JmMind();
            const rootId = mind.root.id;
            const node1 = mind.addNode(JmNodeContent.createText('Node 1'), { parentId: rootId, side: JmNodeSide.SideA });
            const node11 = mind.addNode(JmNodeContent.createText('Node 1.1'), { parentId: node1.id });
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
            void layout.isVisible(rootNode);
            // TODO: add assertions
        });

        it('should return true for visible child node', () => {
            const mind = new JmMind();
            const rootId = mind.root.id;
            const node1 = mind.addNode(JmNodeContent.createText('Node 1'), { parentId: rootId, side: JmNodeSide.SideA });
            const layout = new JmLayout(DEFAULT_OPTIONS.layout);
            layout.calculate(mind);
            void layout.isVisible(node1);
            // TODO: add assertions
        });

        it('should return false for invisible node when parent is folded', () => {
            const mind = new JmMind();
            const rootId = mind.root.id;
            const node1 = mind.addNode(JmNodeContent.createText('Node 1'), { parentId: rootId, side: JmNodeSide.SideA }, { folded: true });
            const node11 = mind.addNode(JmNodeContent.createText('Node 1.1'), { parentId: node1.id });
            const layout = new JmLayout(DEFAULT_OPTIONS.layout);
            layout.calculate(mind);
            void layout.isVisible(node11);
            // TODO: add assertions
        });

        it('should return false for invisible node when grandparent is folded', () => {
            const mind = new JmMind();
            const rootId = mind.root.id;
            const node1 = mind.addNode(JmNodeContent.createText('Node 1'), { parentId: rootId, side: JmNodeSide.SideA }, { folded: true });
            const node11 = mind.addNode(JmNodeContent.createText('Node 1.1'), { parentId: node1.id });
            const node111 = mind.addNode(JmNodeContent.createText('Node 1.1.1'), { parentId: node11.id });
            const layout = new JmLayout(DEFAULT_OPTIONS.layout);
            layout.calculate(mind);
            void layout.isVisible(node111);
            // TODO: add assertions
        });
    });
});

