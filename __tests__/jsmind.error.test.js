import { JsMindError } from '../src/jsmind.error';

test('JsMindError', () => {
    const error = new JsMindError('test');
    expect(error).not.toBeNull();
    expect(error.message).toBe('test');
}
);
