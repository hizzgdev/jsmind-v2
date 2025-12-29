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

    dom.window.requestAnimationFrame = (callback: FrameRequestCallback):number => {
        return setTimeout(() => {
            callback(performance.now());
        }, 0) as unknown as number;
    };

    dom.window.cancelAnimationFrame = (id: number) => {
        clearTimeout(id);
    };

    global.window = dom.window as unknown as Window & typeof globalThis;
    global.document = dom.window.document;
    global.requestAnimationFrame = dom.window.requestAnimationFrame;
    global.cancelAnimationFrame = dom.window.cancelAnimationFrame;
}

export const JSMIND_CONTAINER_ID = 'jsmind-container';
