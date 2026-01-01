import type { JmPoint, JmSize } from '../common/index.ts';
import type { JmMind } from '../model/jsmind.mind.ts';
import type { JmNode } from '../model/node.ts';

export interface Arranger {
    calculate(mind: JmMind): void;
    calculateBoundingBoxSize(mind: JmMind): JmSize;
    calculateNodePoint(node: JmNode): JmPoint;
    calculateNodeOutgoingPoint(node: JmNode): JmPoint;
    calculateNodeIncomingPoint(node: JmNode): JmPoint;
    isNodeVisible(node: JmNode): boolean;

    /**
     * Record the node size for layout calculation.
     */
    recordNodeSize(node: JmNode, size: JmSize): void;
}
