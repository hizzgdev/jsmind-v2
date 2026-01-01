import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { JmNodeView } from '../../src/view/node.ts';
import { JmMind } from '../../src/model/jsmind.mind.ts';
import { JmNodeContent } from '../../src/model/jsmind.node.content.ts';
import { JmNodeSide } from '../../src/model/node.ts';
import { JmSize, JmPoint } from '../../src/common/index.ts';
import { JmElement, DomUtility } from '../../src/common/dom.ts';
import { initDom } from '../setup/jsdom.ts';

describe('JmNodeView', () => {
    let innerContainer: HTMLElement;
    let nodeView: JmNodeView;

    before(() => {
        initDom();
        innerContainer = document.createElement('div');
        document.body.appendChild(innerContainer);
        nodeView = new JmNodeView(innerContainer);
    });

    describe('createNodeView', () => {
        it('should create a node view element for a new node', async () => {
            const mind = new JmMind();
            const rootNode = mind._root;
            const size = await nodeView.createAndMeasure(rootNode);
            assert.ok(size);
            const element = rootNode._data.view.element!;
            assert.ok(element instanceof JmElement);
            assert.strictEqual(element.getAttribute('node-id'), rootNode.id);
            assert.strictEqual(rootNode._data.view.element, element);
        });

        it('should return existing element if node view already created', async () => {
            const mind = new JmMind();
            const rootNode = mind._root;
            const size1 = await nodeView.createAndMeasure(rootNode);
            const size2 = await nodeView.createAndMeasure(rootNode);
            assert.strictEqual(size1.width, size2.width);
            assert.strictEqual(size1.height, size2.height);
        });

        it('should append element to container', async () => {
            const mind = new JmMind();
            const rootId = mind.root.id;
            const node1 = mind.addNode(JmNodeContent.createText('Test Node'), { parentId: rootId, side: JmNodeSide.SideA });
            await nodeView.createAndMeasure(node1);
            const container = innerContainer.querySelector('.jsmind-nodes');
            assert.ok(container);
            assert.ok(container?.contains(node1._data.view.element!.element));
        });

        it('should set node size from element size', async () => {
            // Mock measureElement to return a specific size
            const originalMeasureElement = DomUtility.measureElement;
            const mockWidth = 120;
            const mockHeight = 38;
            DomUtility.measureElement = async (_element: HTMLElement, _container: HTMLElement): Promise<DOMRect> => {
                const rect = {
                    width: mockWidth,
                    height: mockHeight,
                    x: 0,
                    y: 0,
                    top: 0,
                    left: 0,
                    bottom: mockHeight,
                    right: mockWidth,
                    toJSON: () => ({})
                } as DOMRect;
                return rect;
            };

            try {
                const mind = new JmMind();
                const rootNode = mind._root;
                const size = await nodeView.createAndMeasure(rootNode);
                assert.strictEqual(size.width, mockWidth);
                assert.strictEqual(size.height, mockHeight);
                assert.strictEqual(rootNode._data.view.element!.cachedRect.width, mockWidth);
                assert.strictEqual(rootNode._data.view.element!.cachedRect.height, mockHeight);
            } finally {
                // Restore original method
                DomUtility.measureElement = originalMeasureElement;
            }
        });

        it('should create node view with text content', async () => {
            const mind = new JmMind();
            const rootId = mind.root.id;
            const node1 = mind.addNode(JmNodeContent.createText('Hello World'), { parentId: rootId, side: JmNodeSide.SideA });
            await nodeView.createAndMeasure(node1);
            const element = node1._data.view.element!;
            assert.strictEqual(element.innerHTML, 'Hello World');
        });

        it('should create multiple node views independently', async () => {
            const mind = new JmMind();
            const rootId = mind.root.id;
            const node1 = mind.addNode(JmNodeContent.createText('Node 1'), { parentId: rootId, side: JmNodeSide.SideA });
            const node2 = mind.addNode(JmNodeContent.createText('Node 2'), { parentId: rootId, side: JmNodeSide.SideB });
            await nodeView.createAndMeasure(node1);
            await nodeView.createAndMeasure(node2);
            const element1 = node1._data.view.element!;
            const element2 = node2._data.view.element!;
            assert.notStrictEqual(element1, element2);
            assert.strictEqual(element1.getAttribute('node-id'), node1.id);
            assert.strictEqual(element2.getAttribute('node-id'), node2.id);
        });
    });

    describe('removeNodeView', () => {
        it('should remove node view element from DOM', async () => {
            const mind = new JmMind();
            const rootNode = mind._root;
            await nodeView.createAndMeasure(rootNode);
            const element = rootNode._data.view.element!;
            const container = innerContainer.querySelector('.jsmind-nodes');
            assert.ok(container?.contains(element.element));
            nodeView.removeNode(rootNode);
            assert.ok(!container?.contains(element.element));
        });

        it('should handle removing non-existent node view', () => {
            const mind = new JmMind();
            const rootId = mind.root.id;
            const node1 = mind.addNode(JmNodeContent.createText('Node 1'), { parentId: rootId, side: JmNodeSide.SideA });
            assert.doesNotThrow(() => {
                nodeView.removeNode(node1);
            });
        });
    });

    describe('updateNodeViewsSize', () => {
        it('should update container size', () => {
            const viewSize = new JmSize(800, 600);
            nodeView.updateCanvasSize(viewSize);
            const container = innerContainer.querySelector('.jsmind-nodes') as HTMLElement;
            assert.strictEqual(container.style.width, '800px');
            assert.strictEqual(container.style.height, '600px');
        });
    });

    describe('placeNode', () => {
        it('should place node at specified absolute point', async () => {
            const mind = new JmMind();
            const rootNode = mind._root;
            await nodeView.createAndMeasure(rootNode);
            const point = new JmPoint(100, 200);
            nodeView.placeNode(rootNode, point);
            const element = rootNode._data.view.element!;
            assert.strictEqual(element.style.left, '100px');
            assert.strictEqual(element.style.top, '200px');
            assert.strictEqual(element.style.display, 'unset');
            assert.strictEqual(element.style.visibility, 'visible');
        });

        it('should update node innerHTML with content text', async () => {
            const mind = new JmMind();
            const rootId = mind.root.id;
            const node1 = mind.addNode(JmNodeContent.createText('Test Content'), { parentId: rootId, side: JmNodeSide.SideA });
            await nodeView.createAndMeasure(node1);
            const point = new JmPoint(50, 50);
            nodeView.placeNode(node1, point);
            const element = node1._data.view.element!;
            assert.strictEqual(element.innerHTML, 'Test Content');
        });
    });

    describe('hideNode', () => {
        it('should hide node element', async () => {
            const mind = new JmMind();
            const rootNode = mind._root;
            await nodeView.createAndMeasure(rootNode);
            nodeView.hideNode(rootNode);
            const element = rootNode._data.view.element!;
            assert.strictEqual(element.style.display, 'none');
        });
    });
});

