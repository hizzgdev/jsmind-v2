export const debug = (obj: unknown) => {
    console.log('===============================================');
    console.log(`[DEBUG] ${typeof obj}`);
    console.log(obj);
    console.log('===============================================');
};
