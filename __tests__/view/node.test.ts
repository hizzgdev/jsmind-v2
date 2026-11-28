import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { JmNodeView } from '../../src/view/node.ts';
import { JmMind } from '../../src/model/mind.ts';
import { JmNodeContent } from '../../src/model/data/node-content.ts';
import { JmNodeSide } from '../../src/model/data/node.ts';
import { JmSize, JmPoint } from '../../src/common/index.ts';
import { JmElement, DomUtility, JmDomUtility } from '../../src/common/dom.ts';
import { initDom } from '../setup/jsdom.ts';
import { ViewExpanderStyle } from '../../src/common/option.ts';
import { JSMIND_THEME_DEFAULT, JmTone, resolveJmStyle } from '../../src/model/data/style.ts';

const TestData = {
    viewOptions: {
        padding: {
            left: 50,
            right: 50,
            top: 100,
            bottom: 100
        },
        expander: {
            style: ViewExpanderStyle.Char,
            expanded: '\u229D',
            collapsed: '\u2295'
        }
    }
};

describe('JmNodeView', () => {
    let innerContainer: JmElement;
    let nodeView: JmNodeView;

    before(() => {
        initDom();
        innerContainer = JmDomUtility.createElement('div', 'jsmind-inner');
        document.body.appendChild(innerContainer.element);
        nodeView = new JmNodeView(innerContainer, TestData.viewOptions);
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
            const container = innerContainer.element.querySelector('.jsmind-nodes');
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
            const container = innerContainer.element.querySelector('.jsmind-nodes');
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
            const container = innerContainer.element.querySelector('.jsmind-nodes') as HTMLElement;
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
            assert.strictEqual(element.style.visibility, 'hidden');
            assert.strictEqual(element.style.top, '0px');
            assert.strictEqual(element.style.left, '0px');
        });
    });

    describe('refreshNodeStyle', () => {
        // Repainting has to reuse the element that is already on screen: a
        // caller that changed a colour keeps its position, its content and any
        // listener it attached. These cases pin the paint itself, because a
        // cached element that is never recoloured is exactly the reported bug.

        const stubRect = (width: number, height: number): DOMRect => ({
            width,
            height,
            x: 0,
            y: 0,
            top: 0,
            left: 0,
            bottom: height,
            right: width,
            toJSON: () => ({}),
        }) as DOMRect;

        it('repaints an existing element with the new tone and re-measures it', async () => {
            const originalMeasureElement = DomUtility.measureElement;
            let width = 100;
            DomUtility.measureElement = async (): Promise<DOMRect> => stubRect(width++, 40);
            try {
                nodeView.setTheme(resolveJmStyle());
                const mind = new JmMind();
                const node = mind.addNode(JmNodeContent.createText('Repaint'), {
                    parentId: mind.root.id,
                    side: JmNodeSide.SideA,
                });
                node.style = { tone: JmTone.Primary };

                const first = await nodeView.createAndMeasure(node);
                const element = node._data.view.element!;
                assert.strictEqual(
                    element.element.style.getPropertyValue('--jm-node-fill'),
                    JSMIND_THEME_DEFAULT.tones![JmTone.Primary]!.fillColor
                );

                node.style = { tone: JmTone.Danger };
                const second = await nodeView.refreshNodeStyle(node);
                assert.ok(second, 'the repaint should report the size it measured');

                assert.strictEqual(node._data.view.element, element, 'the painted element should be reused');
                assert.strictEqual(
                    element.element.style.getPropertyValue('--jm-node-fill'),
                    JSMIND_THEME_DEFAULT.tones![JmTone.Danger]!.fillColor,
                    'the element should wear the tone the node states now'
                );
                assert.strictEqual(second.width, first.width + 1, 'the repainted node should be measured again');
                assert.strictEqual(element.cachedRect.width, second.width, 'the cache should hold the new size');
            } finally {
                DomUtility.measureElement = originalMeasureElement;
            }
        });

        it('leaves the repainted node on the canvas', async () => {
            // No stubbed measurement here on purpose: the real one takes the
            // element out of the document to read its box and leaves it out, so
            // this is the case that catches a repaint which measures the node and
            // then paints nothing.
            nodeView.setTheme(resolveJmStyle());
            const mind = new JmMind();
            const node = mind.addNode(JmNodeContent.createText('Stays put'), {
                parentId: mind.root.id,
                side: JmNodeSide.SideA,
            });
            await nodeView.createAndMeasure(node);
            const element = node._data.view.element!;
            const container = innerContainer.element.querySelector('.jsmind-nodes');
            assert.ok(container?.contains(element.element), 'the node should start on the canvas');

            node.style = { tone: JmTone.Danger };
            await nodeView.refreshNodeStyle(node);

            assert.ok(container?.contains(element.element), 'the repainted node must stay on the canvas');
        });

        it('drops the overrides a new style no longer states', async () => {
            const originalMeasureElement = DomUtility.measureElement;
            DomUtility.measureElement = async (): Promise<DOMRect> => stubRect(80, 30);
            try {
                nodeView.setTheme(resolveJmStyle());
                const mind = new JmMind();
                const node = mind.addNode(JmNodeContent.createText('Sheds fields'), {
                    parentId: mind.root.id,
                    side: JmNodeSide.SideA,
                });
                node.style = { background: '#123456', fontSize: 20, fontWeight: 'bold', borderWidth: 4 };
                await nodeView.createAndMeasure(node);

                const element = node._data.view.element!;
                assert.strictEqual(element.element.style.getPropertyValue('--jm-node-fill'), '#123456');
                assert.strictEqual(element.element.style.fontSize, '20px');
                assert.strictEqual(element.element.style.borderWidth, '4px');

                // The case a set-only painter gets wrong is every field the new
                // style does not state: applying a style only writes what it
                // carries, so a font size, a weight or a border from the old
                // style would keep painting on top of the tone.
                node.style = { tone: JmTone.Danger };
                await nodeView.refreshNodeStyle(node);

                assert.strictEqual(
                    element.element.style.getPropertyValue('--jm-node-fill'),
                    JSMIND_THEME_DEFAULT.tones![JmTone.Danger]!.fillColor,
                    'the tone should replace the background the node no longer states'
                );
                assert.strictEqual(element.element.style.fontSize, '', 'font size should fall back to the stylesheet');
                assert.strictEqual(element.element.style.fontWeight, '');
                assert.strictEqual(element.element.style.borderWidth, '');
            } finally {
                DomUtility.measureElement = originalMeasureElement;
            }
        });

        it('repaints a node that was never painted by creating it', async () => {
            nodeView.setTheme(resolveJmStyle());
            const mind = new JmMind();
            const node = mind.addNode(JmNodeContent.createText('Fresh'), {
                parentId: mind.root.id,
                side: JmNodeSide.SideA,
            });
            node.style = { tone: JmTone.Success };

            const size = await nodeView.refreshNodeStyle(node);

            assert.ok(node._data.view.element, 'a node without an element should get one');
            assert.ok(size);
            assert.strictEqual(
                node._data.view.element!.element.style.getPropertyValue('--jm-node-fill'),
                JSMIND_THEME_DEFAULT.tones![JmTone.Success]!.fillColor
            );
        });

        it('drops the element it measured when the node was released meanwhile', async () => {
            // A measurement waits a frame, and a map closed inside that frame
            // releases the element. Painting the measured element back would put
            // a node of the closed map on the canvas; reporting a size would hand
            // the layout a box for an element that is no longer there.
            nodeView.setTheme(resolveJmStyle());
            const mind = new JmMind();
            const node = mind.addNode(JmNodeContent.createText('Released mid-flight'), {
                parentId: mind.root.id,
                side: JmNodeSide.SideA,
            });
            await nodeView.createAndMeasure(node);
            const element = node._data.view.element!;
            const container = innerContainer.element.querySelector('.jsmind-nodes');
            assert.ok(container?.contains(element.element), 'the node should start on the canvas');

            const originalMeasureElement = DomUtility.measureElement;
            let settleMeasurement: () => void = () => {};
            const held = new Promise<void>((resolve) => {
                settleMeasurement = resolve;
            });
            DomUtility.measureElement = async (): Promise<DOMRect> => {
                await held;
                return stubRect(90, 30);
            };
            try {
                node.style = { tone: JmTone.Danger };
                const repaint = nodeView.refreshNodeStyle(node);
                // What `close()` does to this node while the repaint waits.
                nodeView.releaseNode(node);
                settleMeasurement();

                const size = await repaint;

                assert.strictEqual(size, null, 'a repaint whose node is gone should report no size');
                assert.ok(!container?.contains(element.element), 'a released element must not be painted back');
                assert.strictEqual(node._data.view.element, null, 'the repaint must not restore the cache either');
            } finally {
                DomUtility.measureElement = originalMeasureElement;
            }
        });
    });

    describe('releaseNode', () => {
        it('detaches the element and clears the cache so the node can be painted again', async () => {
            const mind = new JmMind();
            const node = mind.addNode(JmNodeContent.createText('Released'), {
                parentId: mind.root.id,
                side: JmNodeSide.SideA,
            });
            await nodeView.createAndMeasure(node);
            const element = node._data.view.element!;
            const expander = node._data.view.expander!;
            const container = innerContainer.element.querySelector('.jsmind-nodes');

            nodeView.releaseNode(node);

            assert.strictEqual(node._data.view.element, null);
            assert.strictEqual(node._data.view.expander, null);
            assert.ok(!container?.contains(element.element), 'the node element should be off the canvas');
            assert.ok(!container?.contains(expander.element), 'the expander should be off the canvas');

            await nodeView.createAndMeasure(node);
            assert.notStrictEqual(node._data.view.element, element, 'the next paint should build a new element');
            assert.ok(container?.contains(node._data.view.element!.element));
        });
    });

    describe('tone resolution', () => {
        // The document's defaultTone is the tone an untoned node wears. These
        // cases pin the paint, not the theme: a resolved theme that carried the
        // field but was never read would pass a data-layer test and still render
        // every node in the default palette.

        it('paints an untoned node with the document defaultTone', async () => {
            nodeView.setTheme(resolveJmStyle({ defaultTone: JmTone.Primary }));
            const mind = new JmMind();
            const node = mind.addNode(JmNodeContent.createText('Follows the map'), {
                parentId: mind.root.id,
                side: JmNodeSide.SideA,
            });

            await nodeView.createAndMeasure(node);

            const element = node._data.view.element!.element;
            assert.strictEqual(
                element.style.getPropertyValue('--jm-node-fill'),
                JSMIND_THEME_DEFAULT.tones![JmTone.Primary]!.fillColor
            );
            assert.strictEqual(
                element.style.getPropertyValue('--jm-node-text'),
                JSMIND_THEME_DEFAULT.tones![JmTone.Primary]!.textColor
            );
        });

        it('lets a node state its own tone over the document defaultTone', async () => {
            nodeView.setTheme(resolveJmStyle({ defaultTone: JmTone.Primary }));
            const mind = new JmMind();
            const node = mind.addNode(JmNodeContent.createText('States its own'), {
                parentId: mind.root.id,
                side: JmNodeSide.SideA,
            });
            node.style = { tone: JmTone.Danger };

            await nodeView.createAndMeasure(node);

            const element = node._data.view.element!.element;
            assert.strictEqual(
                element.style.getPropertyValue('--jm-node-fill'),
                JSMIND_THEME_DEFAULT.tones![JmTone.Danger]!.fillColor
            );
        });

        it('paints an untoned node with the default palette when no defaultTone is declared', async () => {
            // The behaviour before this field existed: nothing declared means
            // the built-in default tone, not whatever theme this view saw last.
            nodeView.setTheme(resolveJmStyle());
            const mind = new JmMind();
            const node = mind.addNode(JmNodeContent.createText('Plain'), {
                parentId: mind.root.id,
                side: JmNodeSide.SideA,
            });

            await nodeView.createAndMeasure(node);

            const element = node._data.view.element!.element;
            assert.strictEqual(
                element.style.getPropertyValue('--jm-node-fill'),
                JSMIND_THEME_DEFAULT.tones![JmTone.Default]!.fillColor
            );
        });
    });
});

