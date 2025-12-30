import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { JmSize, JmPoint } from '../../src/common/index.ts';

describe('JmSize', () => {
    it('should create a size with width and height', () => {
        const size = new JmSize(100, 200);
        assert.strictEqual(size.width, 100);
        assert.strictEqual(size.height, 200);
    });
});

describe('JmPoint', () => {
    it('should create a point with x and y coordinates', () => {
        const point = new JmPoint(10, 20);
        assert.strictEqual(point.x, 10);
        assert.strictEqual(point.y, 20);
    });
});

