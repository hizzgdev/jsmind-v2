import JsMind from '../src/jsmind';


test('JsMind static', () => {
    expect(JsMind.Version).not.toBeNull();
    expect(JsMind.Author).not.toBeNull();
}
);

test('jsmind', () => {
    const opts = { a: 'test' };
    const jm = new JsMind(opts);
    expect(jm).not.toBeNull();
    expect(JsMind.Version).toBe('2.0');
});
