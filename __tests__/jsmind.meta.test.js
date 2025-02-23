import { __author__, __version__ } from "../src/jsmind.meta";

test('meta', () => {
    expect(__author__).not.toBeNull();
    expect(__version__).not.toBeNull();
}
);
