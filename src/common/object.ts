/**
 * Plain-object helpers.
 *
 * @packageDocumentation
 */

/**
 * Merges user values over default values, returning a new object.
 *
 * @remarks
 * A one-level merge: nested objects are replaced, not merged field by field.
 * Callers that need a deeper merge must merge each nested section themselves.
 *
 * The user values being absent returns a copy of the defaults rather than the
 * defaults themselves, so the result can be mutated without reaching back into
 * whatever constant was passed in.
 *
 * @param defaultValues - The base values.
 * @param userValues - Values to apply on top, if any.
 * @returns A new object; neither input is mutated.
 *
 * @public
 */
export function mergeObjects<T>(defaultValues: T, userValues?: Partial<T>): T {
    if (!userValues) {
        return { ...defaultValues };
    }

    return {
        ...defaultValues,
        ...userValues
    } as T;
}
