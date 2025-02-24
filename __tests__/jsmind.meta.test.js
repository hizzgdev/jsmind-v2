import { metadata } from "../src/jsmind.meta";

test('metadata', () => {
    const meta = metadata();
    expect(meta).not.toBeNull();
    expect(meta.name).not.toBeNull();
    expect(meta.version).not.toBeNull();
    expect(meta.author).not.toBeNull();
}
);

test('metadata is not shared object', () => {
    const meta1 = metadata();
    const meta2 = metadata();
    expect(meta1).not.toBe(meta2);
}
);
