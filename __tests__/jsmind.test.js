import JsMind from "../src/jsmind";
test('jsmind', ()=>{
    const opts = {a: 'test'};
    const jm = new JsMind(opts);
    expect(jm).not.toBeNull();
});