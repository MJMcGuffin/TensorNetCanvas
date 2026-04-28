import { TensorNode } from './TensorNode.js'



// Each pair of nodes may have multiple connections, and each TensorEdge only stores one connection.
// Contractions are performed on *pairs of nodes* which may involve multiple connections.
export class TensorEdge {
    constructor(
        node1, // reference to TensorNode
        node1_indexId, // integer index id
        node2, // reference to TensorNode
        node2_indexId // integer index id
    ) {
        this.id = -1; // assigned by TensorNet.addEdge()
        this.node1 = node1;
        this.node1_indexId = node1_indexId;
        this.node2 = node2;
        this.node2_indexId = node2_indexId;
    }
    swapNodeInfo() {
        let tmp = this.node1;
        this.node1 = this.node2;
        this.node2 = tmp;

        tmp = this.node1_indexId;
        this.node1_indexId = this.node2_indexId;
        this.node2_indexId = tmp;
    }
}

