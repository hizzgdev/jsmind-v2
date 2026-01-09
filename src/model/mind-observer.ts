import type { JmMindEvent, JmMindEventDataOnEdgeAdded, JmMindEventDataOnEdgeRemoved, JmMindEventDataOnNodeAdded, JmMindEventDataOnNodeMoved, JmMindEventDataOnNodeRemoved, JmMindEventDataOnNodeUpdated } from './event/data.ts';
import { JmMindEventType } from './event/index.ts';
import type { JmMind } from './mind.ts';
import type { JmObserver } from '../observer/index.ts';

export abstract class JmMindObserver implements JmObserver<JmMind> {
    update(observedObject: JmMind, event: unknown): void {
        const eventData = event as JmMindEvent;
        switch (eventData.type) {
            case JmMindEventType.NodeAdded:
                this.onNodeAdded(observedObject, eventData.data as JmMindEventDataOnNodeAdded);
                break;
            case JmMindEventType.NodeRemoved:
                this.onNodeRemoved(observedObject, eventData.data as JmMindEventDataOnNodeRemoved);
                break;
            case JmMindEventType.NodeUpdated:
                this.onNodeUpdated(observedObject, eventData.data as JmMindEventDataOnNodeUpdated);
                break;
            case JmMindEventType.NodeMoved:
                this.onNodeMoved(observedObject, eventData.data as JmMindEventDataOnNodeMoved);
                break;
            case JmMindEventType.EdgeAdded:
                this.onEdgeAdded(observedObject, eventData.data as JmMindEventDataOnEdgeAdded);
                break;
            case JmMindEventType.EdgeRemoved:
                this.onEdgeRemoved(observedObject, eventData.data as JmMindEventDataOnEdgeRemoved);
                break;
        }
    }

    abstract onNodeAdded(observedObject: JmMind, event: JmMindEventDataOnNodeAdded): void;
    abstract onNodeRemoved(observedObject: JmMind, event: JmMindEventDataOnNodeRemoved): void;
    abstract onNodeUpdated(observedObject: JmMind, event: JmMindEventDataOnNodeUpdated): void;
    abstract onNodeMoved(observedObject: JmMind, event: JmMindEventDataOnNodeMoved): void;
    abstract onEdgeAdded(observedObject: JmMind, event: JmMindEventDataOnEdgeAdded): void;
    abstract onEdgeRemoved(observedObject: JmMind, event: JmMindEventDataOnEdgeRemoved): void;
}
