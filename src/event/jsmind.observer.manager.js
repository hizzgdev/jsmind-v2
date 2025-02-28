export class JmObserverManager {
    constructor(observedObject) {
        this.observedObject = observedObject;
        this.observers = [];
    }

    addObserver(observer) {
        observer;
        this.observers.push(observer);
    }

    removeObserver(observer) {
        this.observers = this.observers.filter(o => o !== observer);
    }

    clearObservers() {
        this.observers = [];
    }

    async notifyObservers(event) {
        this.observers.forEach(async (observer) => {
            await new Promise((resolve) => {
                setTimeout(() => {
                    observer.update(this.observedObject, event);
                    resolve();
                });
            });
        }
        );
    }
}
