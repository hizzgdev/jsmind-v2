import type { JmNode } from '../model/node.ts';

export const debug = (label: string, ...objArray: unknown[]) => {
    const titleLength = 80;
    const title = `================= [DEBUG] ${label} `.padEnd(titleLength, '=');
    console.log(title);
    objArray.forEach((obj: unknown) => {
        const objString = JSON.stringify(obj, (key: string, value: unknown) => {
            if (key === 'parent') {
                return (value as JmNode | null)?.id ?? null;
            }
            return value;
        }, 2).replace(/\n/g, '\n ');
        console.log(` ${typeof obj}:`, objString);
    });
    const separator = '-'.repeat(titleLength);
    console.log(separator);
    console.log('');
};

