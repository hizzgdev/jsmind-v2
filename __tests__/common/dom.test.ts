import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { DomUtility, JmElement } from '../../src/common/dom.ts';
import { initDom } from '../setup/jsdom.ts';

describe('DomUtility', () => {
    before(() => {
        initDom();
    });

    it('createElement', () => {
        const jmElement = DomUtility.createElement('div', 'jsmind-container', { 'node-id': 'node-123', 'node-folded': 'false' });
        assert.ok(jmElement);
        assert.ok(jmElement instanceof JmElement);
        assert.ok(jmElement.element);
        assert.strictEqual(jmElement.getAttribute('node-id'), 'node-123');
        assert.strictEqual(jmElement.getAttribute('node-folded'), 'false');
        assert.strictEqual(jmElement.classList.contains('jsmind-container'), true);

        const element = jmElement.element;
        assert.strictEqual(element.tagName, 'DIV');
        assert.strictEqual(element.className, 'jsmind-container');
        assert.strictEqual(element.getAttribute('data-jm-node-id'), 'node-123');
        assert.strictEqual(element.getAttribute('data-jm-node-folded'), 'false');
        assert.strictEqual(element.classList.contains('jsmind-container'), true);
    });
});

describe('JmElement', () => {
    before(() => {
        initDom();
    });

    it('constructor', () => {
        const element = document.createElement('div');
        const jmElement = new JmElement(element);
        assert.ok(jmElement);
        assert.ok(jmElement instanceof JmElement);
        assert.ok(jmElement.element);
        assert.strictEqual(jmElement.element.tagName, 'DIV');
    });

    it('classList', () => {
        const element = document.createElement('div');
        const jmElement = new JmElement(element);
        jmElement.classList.add('jsmind-container');
        assert.strictEqual(jmElement.classList.contains('jsmind-container'), true);
        assert.strictEqual(element.classList.contains('jsmind-container'), true);
    });

    it('attributes', () => {
        const element = document.createElement('div');
        const jmElement = new JmElement(element);
        jmElement.setAttribute('node-id', 'node-123');
        assert.strictEqual(jmElement.getAttribute('node-id'), 'node-123');
        assert.strictEqual(element.getAttribute('data-jm-node-id'), 'node-123');

        jmElement.removeAttribute('node-id');
        assert.ok(!jmElement.getAttribute('node-id'));
        assert.ok(!element.getAttribute('data-jm-node-id'));
    });

    it('appendChild', () => {
        const parentElement = document.createElement('div');
        const childElement1 = document.createElement('div');
        const childElement2 = document.createElement('div');
        const jmParentElement = new JmElement(parentElement);
        const jmChildElement1 = new JmElement(childElement1);
        jmParentElement.appendChild(jmChildElement1);
        jmParentElement.appendChild(childElement2);
        assert.strictEqual(parentElement.childElementCount, 2);
        assert.strictEqual(parentElement.firstChild, childElement1);
        assert.strictEqual(parentElement.lastChild, childElement2);
    });
});
