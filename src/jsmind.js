import { JmMind } from "./jsmind.mind";

class JsMind {
    static get Version() { return '2.0'; }

    static get Author() { return 'hizzgdev@163.com'; }

    constructor(options) {
        const a = options.a;
        console.log(a);
    }
}

export default JsMind;
