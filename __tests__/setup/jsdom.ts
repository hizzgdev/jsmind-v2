import { JSDOM } from 'jsdom';

export function initDom() {
    const dom = new JSDOM(
        '<!DOCTYPE html><html><head></head><body><div id="jsmind-container"></div></body></html>',
        {
            url: 'http://localhost',
            runScripts: 'dangerously',
            resources: 'usable'
        }
    );

    dom.window.requestAnimationFrame = (callback: FrameRequestCallback): number => {
        return setTimeout(() => {
            callback(performance.now());
        }, 0) as unknown as number;
    };

    dom.window.cancelAnimationFrame = (id: number) => {
        clearTimeout(id);
    };

    dom.window.IntersectionObserver = MockIntersectionObserver;

    global.window = dom.window as unknown as Window & typeof globalThis;
    global.document = dom.window.document;
    global.requestAnimationFrame = dom.window.requestAnimationFrame;
    global.cancelAnimationFrame = dom.window.cancelAnimationFrame;
    global.IntersectionObserver = MockIntersectionObserver;
}

class MockIntersectionObserver implements IntersectionObserver {

    private callback: IntersectionObserverCallback;

    root: Element | null = null;

    rootMargin: string = '0px';

    thresholds: ReadonlyArray<number> = [0];

    constructor(callback: IntersectionObserverCallback, _options?: IntersectionObserverInit) {
        this.callback = callback;
    }

    disconnect = () => {};

    takeRecords = () => [];

    observe = (target: Element) => {
        setTimeout(() => {
            const entity = {
                isIntersecting: true,
                target,
                boundingClientRect: new MockDOMRect(),
                intersectionRect: new MockDOMRect(),
                intersectionRatio: 1,
                rootBounds: null,
                time: 0
            };
            this.callback([entity], this);
        }, 0);
    };

    unobserve = () => {};
}

class MockDOMRect implements DOMRect {
    bottom: number = 0;

    left: number = 0;

    right: number = 0;

    top: number = 0;

    width: number = 0;

    height: number = 0;

    x: number = 0;

    y: number = 0;

    toJSON = () => this as unknown as DOMRectReadOnly;
}

export const JSMIND_CONTAINER_ID = 'jsmind-container';
