/**
 * @interface
 * This is an interface and should not be used like a class.
 * It defines what an observer should look like.
 * You don't have to explicitly extend it in your observer, jsMind will only check the observer's methods when adding observers to objects.
 */
export class JmObserver {
    /**
     * This method will be called when state changes in observed object.
     * @param {Object} observedObject
     * @param {Object} event
     */
    update(observedObject, event) {
        throw new Error('not implemented', observedObject, event);
    }
}
