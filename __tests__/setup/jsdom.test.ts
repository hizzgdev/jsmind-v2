import { JSDOM } from 'jsdom';

const dom = new JSDOM(
    `<!DOCTYPE html>
   <html>
     <head></head>
     <body>
       <div id="jsmind-container"></div>
     </body>
   </html>`,
    {
        url: 'http://localhost',
        runScripts: 'dangerously',
        resources: 'usable'
    }
);

global.window = dom.window as unknown as Window & typeof globalThis;
global.document = dom.window.document;

export const JSMIND_CONTAINER_ID = 'jsmind-container';
