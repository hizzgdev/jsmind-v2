import { IdGenerator } from '../jsmind.interfaces';

export class SimpleIdGenerator extends IdGenerator {
    constructor(prefix) {
        super();
        this.seed = new Date().getTime();
        this.seq = 0;
        this.prefix = prefix || '';
    }

    newId() {
        this.seq++;
        return this.prefix + (this.seed + this.seq).toString(36);
    }
}
