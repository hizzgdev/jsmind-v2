import { JmMind } from '../../src/model/mind.ts';
import { JmNodeContent } from '../../src/model/node-content.ts';
import { JmEdgeType } from '../../src/model/edge.ts';

const metadata = {
    name: 'Test Mind Map',
    version: '1.0',
    author: 'test@example.com'
};

const options = {
    rootNodeId: 'test_root'
};

const mind = new JmMind(metadata, options);
const node1 = mind.addNode(JmNodeContent.createText('Test Node1'), { parentId: options.rootNodeId });
const node2 = mind.addNode(JmNodeContent.createText('Test Node2'), { parentId: options.rootNodeId });
const node11 = mind.addNode(JmNodeContent.createText('Test Node11'), { parentId: node1.id });
const edge11to2 = mind.addEdge(node11.id, node2.id, JmEdgeType.Link);


export { mind as TEST_MIND, node1 as TEST_NODE_1, node2 as TEST_NODE_2, node11 as TEST_NODE_11, edge11to2 as TEST_EDGE_11TO2 };
