import type { JmBounds, JmPoint, JmSize } from '../common/index.ts';
import type { JmMind } from '../model/mind.ts';
import type { JmNode } from '../model/node.ts';

export interface Arranger {
    calculate(mind: JmMind): void;
    calculateMindBounds(mind: JmMind): JmBounds;
    calculateNodePoint(node: JmNode): JmPoint;
    calculateNodeExpanderPoint(node: JmNode): JmPoint;
    calculateNodeOutgoingPoint(node: JmNode): JmPoint;
    calculateNodeIncomingPoint(node: JmNode): JmPoint;
    isNodeVisible(node: JmNode): boolean;

    /**
     * Record the node size for layout calculation.
     */
    recordNodeSize(node: JmNode, size: JmSize): void;
}
