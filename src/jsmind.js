import { __author__, __version__ } from './jsmind.meta';

class JsMind {
    static get Version() {
        return __version__;
    }

    static get Author() {
        return __author__;
    }

    constructor(options) {
        const a = options.a;
        console.log(a);
    }
}

export default JsMind;
