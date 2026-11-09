/**
 * Reading, writing and deleting a nested field by path.
 *
 * @remarks
 * A command that lets a caller set one field of a nested object needs the same
 * three operations whatever the object is: set a value somewhere down a path,
 * remove one, and report what is there. Keeping those here rather than beside
 * one command means the next command that reaches into a nested field does not
 * write them again - and does not have to know, as this module does not, which
 * fields exist.
 *
 * Paths are plain string arrays. `['incoming', 'color']` is `style.incoming.color`.
 * Nothing here assumes a depth or a name.
 *
 * @packageDocumentation
 */

/**
 * A route into a nested object.
 *
 * @public
 */
export type FieldPath = readonly string[];

/**
 * Turns a command-line flag name into a path.
 *
 * @param flag - Flag name without leading dashes, e.g. `incoming.color` or
 *               `font-size`.
 * @returns The path, e.g. `['incoming', 'color']` or `['fontSize']`.
 * @remarks
 * Dots mark a level, dashes join the words of one level. That split means the
 * flag name is the only place a field's location is written down: the path is
 * derived, so the two cannot drift apart.
 */
export function flagToPath(flag: string): FieldPath {
    return flag.split('.').map(segment => segment.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()));
}

/**
 * Renders a path as a flag name.
 *
 * @param path - Route into an object.
 * @returns The flag name that addresses it.
 */
export function pathToFlag(path: FieldPath): string {
    return path
        .map(segment => segment.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`))
        .join('.');
}

/**
 * Reads the value at a path.
 *
 * @param target - Object to read from.
 * @param path - Route into it.
 * @returns The value, or `undefined` when any level is missing.
 */
export function getAtPath(target: unknown, path: FieldPath): unknown {
    let current: unknown = target;
    for (const key of path) {
        if (current === null || typeof current !== 'object') {
            return undefined;
        }
        current = (current as Record<string, unknown>)[key];
    }
    return current;
}

/**
 * Writes a value at a path, creating intermediate objects.
 *
 * @param target - Object to write into, mutated in place.
 * @param path - Route into it.
 * @param value - Value to store.
 * @remarks
 * Intermediate objects are created as plain objects. A path that runs through a
 * non-object would have to overwrite it, so it stops instead: that is a
 * contradiction in the caller's data, not something to paper over.
 */
export function setAtPath(target: Record<string, unknown>, path: FieldPath, value: unknown): void {
    if (path.length === 0) {
        throw new Error('setAtPath needs a non-empty path');
    }
    let current = target;
    for (const key of path.slice(0, -1)) {
        const next = current[key];
        if (next === undefined) {
            const created: Record<string, unknown> = {};
            current[key] = created;
            current = created;
            continue;
        }
        if (next === null || typeof next !== 'object') {
            throw new Error(`Cannot descend into "${key}": it holds a ${typeof next}, not an object`);
        }
        current = next as Record<string, unknown>;
    }
    current[path[path.length - 1]] = value;
}

/**
 * Removes the value at a path.
 *
 * @param target - Object to modify, mutated in place.
 * @param path - Route into it.
 * @returns Whether anything was removed.
 * @remarks
 * Intermediate objects left empty by the removal are dropped as well. Without
 * that, clearing the last field of a nested block leaves `{ incoming: {} }`
 * behind, which means the same as absent but does not serialise to nothing.
 */
export function deleteAtPath(target: Record<string, unknown>, path: FieldPath): boolean {
    if (path.length === 0) {
        return false;
    }

    const chain: Record<string, unknown>[] = [target];
    let current: unknown = target;
    for (const key of path.slice(0, -1)) {
        if (current === null || typeof current !== 'object') {
            return false;
        }
        current = (current as Record<string, unknown>)[key];
        if (current === null || typeof current !== 'object') {
            return false;
        }
        chain.push(current as Record<string, unknown>);
    }

    const leaf = path[path.length - 1];
    const holder = chain[chain.length - 1];
    if (!(leaf in holder)) {
        return false;
    }
    delete holder[leaf];
    if (path.length === 1) {
        return true;
    }

    // Walk back up dropping containers this removal emptied.
    for (let i = chain.length - 1; i > 0; i -= 1) {
        if (Object.keys(chain[i]).length > 0) {
            break;
        }
        delete chain[i - 1][path[i - 1]];
    }
    return true;
}
