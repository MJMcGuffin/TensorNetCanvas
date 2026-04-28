import { Util } from '../Util.js'
import { CTensor } from './CTensor.js'
import { TensorNode } from './TensorNode.js'
import { TensorEdge } from './TensorEdge.js'



export class TensorNet {
    constructor() {
        this.minUnusedNodeID = 0;
        this.minUnusedEdgeID = 0;
        this.minUnusedIndexID = 0;

        this.nodes = new Map(); // id -> TensorNode
        this.edges = new Map(); // id -> TensorEdge
    }

    _getUnusedNodeID() {
        let id = this.minUnusedNodeID;
        this.minUnusedNodeID ++;
        if ( TensorNet.PRINT_DEBUG_INFO_1 ) {
            console.log(`  Generating node id ${id}`);
        }
        return id;
    }
    _getUnusedEdgeID() {
        let id = this.minUnusedEdgeID;
        this.minUnusedEdgeID ++;
        return id;
    }
    _getUnusedIndexID() {
        let id = this.minUnusedIndexID;
        this.minUnusedIndexID ++;
        return id;
    }

    // Assigns unique IDs to any indices on the node that don't yet have one.
    assignIndexIds( node ) {
        for ( let idx of node.indices ) {
            if ( idx.id === undefined || idx.id === -1 ) {
                idx.id = this._getUnusedIndexID();
            }
        }
    }

    addNode( node ) {
        if ( node.id === -1 ) {
            node.id = this._getUnusedNodeID();
        }
        this.assignIndexIds( node );
        this.nodes.set( node.id, node );
        node.areIDsInitialized = true;
    }
    addEdge( edge ) {
        if ( edge.id === -1 ) {
            edge.id = this._getUnusedEdgeID();
        }
        this.edges.set( edge.id, edge );

        edge.node1.addIncidentEdge(edge);
        if ( edge.node2 !== edge.node1 ) {
            edge.node2.addIncidentEdge(edge);
        }
    }

    reset() {
        this.nodes.clear();
        this.edges.clear();
        this.minUnusedNodeID = 0;
        this.minUnusedEdgeID = 0;
        this.minUnusedIndexID = 0;
    }

    getAllEdgesBetweenNodes( node1, node2 ) {
        const nodeWithFewerEdges = (node1.incidentEdges.length <= node2.incidentEdges.length) ? node1 : node2;
        const otherNode = (nodeWithFewerEdges === node1) ? node2 : node1;

        return (nodeWithFewerEdges.neighboringNodes.get(otherNode) ?? []).slice(); // deep copy
    }

    // Direct computation of contraction cost (used internally)
    // Note that, when working with tensor nets derived from quantum circuits,
    // the dimension of each index is always 2,
    // and the cost computed by this routine will always be a power of 2,
    // so an alternative way to implement the below routine is to
    // make it return the log2 of the cost,
    // which could be computed a bit more efficiently,
    // at the cost of reducing the generality of the code.
    _computeContractionCostDirect( node1, node2, edges ) {
        // Cost = product of all dimensions in resulting tensor
        //   = product of all dims in both tensors, divided by contracted dims
        let cost = 1;
        for ( let idx of node1.indices ) {
            cost *= idx.dim;
        }
        // For a self-edge (trace), the cost equals the number of elements in the input tensor,
        // which is already computed above.  The second loop would double-count the free indices.
        if ( node1 === node2 ) return cost;
        for ( let idx of node2.indices ) {
            let countThisIndex = true;
            for ( let edge of edges ) {
                if ( edge.node1_indexId === idx.id || edge.node2_indexId === idx.id ) {
                    // we already multiplied the cost by the dim of this index when iterating over node1's indices
                    countThisIndex = false;
                    break;
                }
            }
            if ( countThisIndex )
                cost *= idx.dim;
        }
        return cost;
    }
    // Helper method to compute costs for all neighbors of a node
    _computeAllNeighborCosts( node ) {
        for (const [neighbor, edges] of node.neighboringNodes) {
            const cost = this._computeContractionCostDirect(node, neighbor, edges);
            node.contractionCosts.set( neighbor, cost );

            Util.assert( neighbor.costsAreDirty || neighbor.contractionCosts.get(node)===cost, "_computeAllNeighborCosts(): neighbor has different cost" );
        }
    }
    computeContractionCost( node1, node2 ) {
        if ( node1 === node2 ) { // If they are the same node ...
            const edges = node1.neighboringNodes.has( node1 ) ? node1.neighboringNodes.get( node1 ) : [];
            return this._computeContractionCostDirect( node1, node1, edges );
        }
        if ( !node1.neighboringNodes.has( node2 ) ) { // If there are no edges...
            return this._computeContractionCostDirect( node1, node2, [] );
        }
        if ( node1.costsAreDirty ) {
            this._computeAllNeighborCosts( node1 );
            node1.costsAreDirty = false;
        }
        if ( node2.costsAreDirty ) {
            this._computeAllNeighborCosts( node2 );
            node2.costsAreDirty = false;
        }
        return node1.contractionCosts.get( node2 );
    }

    // Find the best next contraction to perform in the network.
    // Note that a contraction always involves a pair of nodes,
    // and involves one or more edges.
    findNextNodePairToContract( contractionOrderingPolicy = TensorNet.COP_MIN ) {

        // Collect unique node pairs connected by at least one edge.
        // Using the node object itself as a Map key (reference identity) avoids string conversion.
        // The node with the smaller id is always the outer key so each unordered pair is stored once.
        // Self-edges (node1 === node2) are included: the node maps to itself.
        const seenPairs = new Map(); // TensorNode -> Set<TensorNode>
        for ( let edge of this.edges.values() ) {
            const [lo, hi] = edge.node1.id <= edge.node2.id
                ? [edge.node1, edge.node2]
                : [edge.node2, edge.node1];
            if ( !seenPairs.has(lo) ) seenPairs.set( lo, new Set() );
            seenPairs.get(lo).add(hi);
        }

        let nodePairs = [];
        for ( const [lo, hiSet] of seenPairs ) {
            for ( const hi of hiSet ) {
                nodePairs.push( [lo, hi] );
            }
        }

        if ( contractionOrderingPolicy === TensorNet.COP_RANDOM ) {
            const [ node1, node2 ] = nodePairs[ Math.floor( Math.random()*nodePairs.length ) ];
            let cost = this.computeContractionCost( node1, node2 );
            return [ node1, node2, cost ];
        }

        // TODO It's wasteful to search through all pair costs each time we are called;
        // It would be better to maintain a list of node pairs sorted by cost,
        // and whenever there is a contraction, we could recompute the costs of affected node pairs
        // and update their positions in the sorted list.
        // But the complexity of implementing this is perhaps not worth it.
        let bestCost;
        let bestTuple = null;
        for ( let i = 0; i < nodePairs.length; i++ ) {
            const [ node1, node2 ] = nodePairs[i];

            const cost = this.computeContractionCost( node1, node2 );
            // console.log(`evaluating pair ${node1.id}-${node2.id} costing ${cost}`);
            if (
                i === 0
                || ( contractionOrderingPolicy===TensorNet.COP_MIN && cost < bestCost )
                || ( contractionOrderingPolicy===TensorNet.COP_MAX && cost > bestCost )
            ) {
                if ( TensorNet.PRINT_DEBUG_INFO_2 )
                    console.log(`Best contraction candidate pair so far: ${node1.id}-${node2.id} costing ${cost}`);
                bestCost = cost;
                bestTuple = [ node1, node2, cost ];
            }
        }
        return bestTuple;
    }

    // Returns resulting CTensor
    completelyContractTensorNet( contractionOrderingPolicy = TensorNet.COP_MIN ) {

        let totalCost = 0;

        if ( TensorNet.PRINT_DEBUG_INFO_1 )
            this.storeDescriptionString();

        // Greedy contraction
        while ( this.edges.size > 0 ) {
            const [node1, node2, cost] = this.findNextNodePairToContract( contractionOrderingPolicy );
            if ( TensorNet.PRINT_DEBUG_INFO_1 ) {
                let indexTypesString = this.getAllEdgesBetweenNodes(node1,node2).map(e => `${e.node1.getIndexObjectById(e.node1_indexId)?.indexType}-${e.node2.getIndexObjectById(e.node2_indexId)?.indexType}`).join(', ');
                console.log(`Contracting nodes ${node1.id} and ${node2.id} at a cost of ${cost} across indices of type ${indexTypesString}`);
                //if ( this.nodes.size < 5 ) {
                //    console.log("===== Network is almost completely contracted. Here is a description:")
                //    this.performConsistencyCheck();
                //    this.printDescription();
                //}
                //if ( this.nodes.size === 2 ) {
                //    console.log('The last two tensors have these shapes:');
                //    console.log( node1.tensor.getShape() );
                //    console.log( node2.tensor.getShape() );
                //}
            }
            if ( node1 === node2 ) {
                this.performUnaryContraction( node1 );
            } else {
                this.performBinaryContraction( node1, node2 );
            }
            if ( TensorNet.PRINT_DEBUG_INFO_1 ) {
                this.storeDescriptionString();
                if ( this.performConsistencyCheck() === false ) {
                    this.printStoredDescriptionStrings();
                    return null;
                }
            }
            totalCost += cost;
        }
        if ( TensorNet.PRINT_DEBUG_INFO_1 )
            console.log(`Total cost of contracting the net was ${totalCost}`);

        // we assume the network is connected, but if it isn't, we'll end up with more than 1 node
        Util.assert( this.nodes.size === 1, `completelyContractTensorNet(): unexpected condition - after contracting all edges in the tensor net, there are ${this.nodes.size} nodes left, indicating that we started with that many connected components` );

        // We should have a single node left; returns its CTensor
        let finalTensorNode = Array.from( this.nodes.values() )[0];
        finalTensorNode.transposeLexicographically(); // ensure the indices are sorted by name
        if ( TensorNet.PRINT_DEBUG_INFO_2 ) {
            console.log("After lexicographic sorting:");
            console.log(finalTensorNode.indices);
        }
        return finalTensorNode.tensor;
    }


    // Copies a subset of nodes (and optionally their edges) into this network.
    // nodes: any iterable of TensorNode references belonging to this network
    // copyIntraEdges: if true, copy edges whose both endpoints are within the subset
    // copyInterEdges: if true, copy edges with one endpoint in the subset and one outside
    // dx, dy: world-coordinate offset applied to each copied node's position
    // Returns an array of the newly created TensorNode instances.
    copySubsetOfNodes(nodes, copyIntraEdges, copyInterEdges, dx = 0, dy = 0) {
        const subsetSet = nodes instanceof Set ? nodes : new Set(nodes);
        const nodeMap = new Map();    // old TensorNode -> new TensorNode
        const indexIdMap = new Map(); // old index id -> new index id

        // Clone each node
        for (const node of subsetSet) {
            const newTensor = new CTensor(node.tensor.shape);
            newTensor.data.set(node.tensor.data);

            const newIndices = node.indices.map(idx => {
                const newId = this._getUnusedIndexID();
                indexIdMap.set(idx.id, newId);
                return { id: newId, name: idx.name, dim: idx.dim, indexType: idx.indexType };
            });

            const newNode = new TensorNode(newTensor, newIndices);
            newNode.name = node.name;
            newNode.isCollapsed = node.isCollapsed;
            if (node.areCoordinatesInitialized) {
                newNode.x = node.x + dx;
                newNode.y = node.y + dy;
                newNode.areCoordinatesInitialized = true;
            }

            this.addNode(newNode);
            nodeMap.set(node, newNode);
        }

        // Snapshot edges before iterating so that addEdge() calls below don't affect the loop
        const existingEdges = Array.from(this.edges.values());

        for (const edge of existingEdges) {
            const n1In = subsetSet.has(edge.node1);
            const n2In = subsetSet.has(edge.node2);

            // Self-edge: both ends are the same node; treat as intra-subset
            if (edge.node1 === edge.node2) {
                if (n1In && copyIntraEdges) {
                    const nn = nodeMap.get(edge.node1);
                    this.addEdge(new TensorEdge(
                        nn, indexIdMap.get(edge.node1_indexId),
                        nn, indexIdMap.get(edge.node2_indexId)
                    ));
                }
                continue;
            }

            if (n1In && n2In) {
                if (copyIntraEdges) {
                    this.addEdge(new TensorEdge(
                        nodeMap.get(edge.node1), indexIdMap.get(edge.node1_indexId),
                        nodeMap.get(edge.node2), indexIdMap.get(edge.node2_indexId)
                    ));
                }
            } else if (n1In) {
                if (copyInterEdges) {
                    this.addEdge(new TensorEdge(
                        nodeMap.get(edge.node1), indexIdMap.get(edge.node1_indexId),
                        edge.node2, edge.node2_indexId
                    ));
                }
            } else if (n2In) {
                if (copyInterEdges) {
                    this.addEdge(new TensorEdge(
                        edge.node1, edge.node1_indexId,
                        nodeMap.get(edge.node2), indexIdMap.get(edge.node2_indexId)
                    ));
                }
            }
        }

        return Array.from(nodeMap.values());
    }

    performConsistencyCheck() {
        //console.log("Performing consistency check on TensorNet...");

        // Check 1: All index IDs across all nodes should be unique
        const allIndexIds = new Map(); // Maps index id to {nodeId, indexPosition}

        for (let [nodeId, node] of this.nodes) {
            for (let i = 0; i < node.indices.length; i++) {
                const indexId = node.indices[i].id;

                if (allIndexIds.has(indexId)) {
                    const existing = allIndexIds.get(indexId);
                    Util.assert(false,
                        `Warning: Duplicate index id ${indexId} found in Node ${nodeId} (index ${i}) ` +
                        `and Node ${existing.nodeId} (index ${existing.indexPosition})`);
                    return false;
                }

                allIndexIds.set(indexId, {nodeId, indexPosition: i});
            }
        }

        // Check 2: Each edge's index IDs should exist in their respective nodes
        for (let [edgeId, edge] of this.edges) {
            // Check node1
            const node1IndexObj = edge.node1.getIndexObjectById(edge.node1_indexId);
            if (!node1IndexObj) {
                Util.assert(false,
                    `Warning: Edge ${edgeId} references index id ${edge.node1_indexId} ` +
                    `which does not exist in Node ${edge.node1.id}`);
                return false;
            }

            // Check node2
            const node2IndexObj = edge.node2.getIndexObjectById(edge.node2_indexId);
            if (!node2IndexObj) {
                Util.assert(false,
                    `Warning: Edge ${edgeId} references index id ${edge.node2_indexId} ` +
                    `which does not exist in Node ${edge.node2.id}`);
                return false;
            }

            // Check 3: Connected indices should have matching dimensions
            if (node1IndexObj && node2IndexObj && node1IndexObj.dim !== node2IndexObj.dim) {
                Util.assert(false,
                    `Warning: Edge ${edgeId} connects indices with different dimensions: ` +
                    `index id ${edge.node1_indexId} (dim=${node1IndexObj.dim}) in Node ${edge.node1.id} ` +
                    `and index id ${edge.node2_indexId} (dim=${node2IndexObj.dim}) in Node ${edge.node2.id}`);
                return false;
            }
        }

        // Check 4: Each node's tensor shape should match its indices dimensions
        for (let [nodeId, node] of this.nodes) {
            const tensorShape = node.tensor.getShape();

            if (tensorShape.length !== node.indices.length) {
                Util.assert(false,
                    `Warning: Node ${nodeId} has tensor rank ${tensorShape.length} ` +
                    `but ${node.indices.length} indices`);
                return false;
            }
            else {
                // Check that each dimension matches
                for (let i = 0; i < tensorShape.length; i++) {
                    if (tensorShape[i] !== node.indices[i].dim) {
                        Util.assert(false,
                            `Warning: Node ${nodeId} tensor dimension ${i} has size ${tensorShape[i]} ` +
                            `but index '${node.indices[i].name}' has dim=${node.indices[i].dim}`);
                        return false;
                    }
                }
            }
        }

        // Check 5: No self-loops (edge connecting a node to itself with same index)
        for (let [edgeId, edge] of this.edges) {
            if (edge.node1 === edge.node2 && edge.node1_indexId === edge.node2_indexId) {
                Util.assert(false,
                    `Warning: Edge ${edgeId} creates a self-loop on Node ${edge.node1.id} ` +
                    `with index id ${edge.node1_indexId}`);
                return false;
            }
        }

        // Check 6: Consistency of incidentEdges for each node
        for (let [nodeId, node] of this.nodes) {
            // Check that each incident edge actually refers back to this node
            for (let edge of node.incidentEdges) {
                if (edge.node1 !== node && edge.node2 !== node) {
                    Util.assert(false,
                        `Warning: Node ${nodeId} lists Edge ${edge.id} as incident, ` +
                        `but the edge connects Nodes ${edge.node1.id} and ${edge.node2.id}`);
                    return false;
                }
            }

            // Check that all edges referencing this node are in incidentEdges
            let expectedIncidentCount = 0;
            for (let [edgeId, edge] of this.edges) {
                if (edge.node1 === node || edge.node2 === node) {
                    expectedIncidentCount++;
                    if (!node.incidentEdges.includes(edge)) {
                        Util.assert(false,
                            `Warning: Edge ${edgeId} connects to Node ${nodeId} ` +
                            `but is not in the node's incidentEdges list`);
                        return false;
                    }
                }
            }

            if (node.incidentEdges.length !== expectedIncidentCount) {
                Util.assert(false,
                    `Warning: Node ${nodeId} has ${node.incidentEdges.length} incident edges ` +
                    `but should have ${expectedIncidentCount}`);
                return false;
            }
        }

        // Check 7: Consistency of neighboringNodes for each node
        for (let [nodeId, node] of this.nodes) {
            // Check each neighboring node relationship
            for (let [neighbor, edges] of node.neighboringNodes) {
                // Check that neighbor has this node as a neighbor too
                if (!neighbor.neighboringNodes.has(node)) {
                    Util.assert(false,
                        `Warning: Node ${nodeId} lists Node ${neighbor.id} as a neighbor, ` +
                        `but Node ${neighbor.id} does not reciprocate`);
                    return false;
                }

                // Check that there's at least one edge between them
                if (edges.length === 0) {
                    Util.assert(false,
                        `Warning: Node ${nodeId} lists Node ${neighbor.id} as a neighbor ` +
                        `but there are no edges between them`);
                    return false;
                }

                // Check that all edges actually connect these two nodes
                for (let edge of edges) {
                    if (!((edge.node1 === node && edge.node2 === neighbor) ||
                          (edge.node1 === neighbor && edge.node2 === node))) {
                        Util.assert(false,
                            `Warning: Edge ${edge.id} is listed as connecting Nodes ${nodeId} and ${neighbor.id} ` +
                            `but actually connects Nodes ${edge.node1.id} and ${edge.node2.id}`);
                        return false;
                    }
                }

                // Check that the edges match what's in the neighbor's list
                const neighborEdges = neighbor.neighboringNodes.get(node);
                if (neighborEdges) {
                    if (edges.length !== neighborEdges.length) {
                        Util.assert(false,
                            `Warning: Node ${nodeId} has ${edges.length} edges to Node ${neighbor.id} ` +
                            `but Node ${neighbor.id} has ${neighborEdges.length} edges back`);
                        return false;
                    }
                    // Check that the edge sets are identical
                    for (let edge of edges) {
                        if (!neighborEdges.includes(edge)) {
                            Util.assert(false,
                                `Warning: Edge ${edge.id} is in Node ${nodeId}'s list for neighbor ${neighbor.id} ` +
                                `but not in the reciprocal list`);
                            return false;
                        }
                    }
                }
            }
        }

        //console.log("Consistency check complete.");
        return true;
    }


    generateDescriptionString() {
        let s = "";
        for (let [nodeId, node] of this.nodes) {
            s += `Node ${nodeId}:\n`;
            // Tensor contents
            // Indent the tensor string output
            let tensorString = node.tensor.toString();
            let indentedTensorString = tensorString.split('\n').map(line => '    ' + line).join('\n');
            s += indentedTensorString + '\n';

            // Indices
            for (let i = 0; i < node.indices.length; i++) {
                let idx = node.indices[i];
                let indexTypeStr = '';
                if (idx.indexType === TensorNode.IT_INPUT) indexTypeStr = 'INPUT';
                else if (idx.indexType === TensorNode.IT_OUTPUT) indexTypeStr = 'OUTPUT';
                else if (idx.indexType === TensorNode.IT_CONTROL_IN) indexTypeStr = 'CONTROL_IN';
                else if (idx.indexType === TensorNode.IT_CONTROL_OUT) indexTypeStr = 'CONTROL_OUT';
                s += `    index [${i}] id: ${idx.id}, name: "${idx.name}", dim: ${idx.dim}, type: ${indexTypeStr}\n`;
            }

            s += `  Incident edges: [${node.incidentEdges.map(e => e.id).join(', ')}]\n`;
            s += `  Costs are dirty: ${node.costsAreDirty}\n`;
            s += `  Neighboring nodes and contraction costs:\n`;
            for (let [neighbor, edges] of node.neighboringNodes) {
                const cost = node.contractionCosts.get(neighbor);
                const costStr = (cost !== undefined) ? cost : 'not computed';
                s += `    Node ${neighbor.id}: ${edges.length} edge(s) [${edges.map(e => e.id).join(', ')}], cost = ${costStr}\n`;
            }
        }
        // Edges
        for (let [edgeId, edge] of this.edges) {
            s += `Edge ${edgeId}: Node ${edge.node1.id} (index id ${edge.node1_indexId}) <-> Node ${edge.node2.id} (index id ${edge.node2_indexId})\n`;
        }
        return s;
    }
    printDescription() {
        let s = this.generateDescriptionString();
        console.log( s );
    }
    storeDescriptionString() {
        this.previousDescriptionString = this.descriptionString;
        this.descriptionString = this.generateDescriptionString();
    }
    printStoredDescriptionStrings() {
        console.log("-----PREVIOUS DESCRIPTION-----");
        console.log( this.previousDescriptionString );
        this.previousDescriptionString = "";
        console.log("-----CURRENT DESCRIPTION-----");
        console.log( this.descriptionString );
        this.descriptionString = "";
    }

    // Serializes this network to a JSON string that can be reconstructed by TensorNet.fromJSONString().
    // Nodes are serialized via TensorNode.toJSONString().
    // Edges are encoded as [[i,j],[k,l]] where i,k are 0-based node indices (in insertion order)
    // and j,l are 0-based indices into the respective node's indices array.
    toJSONString() {
        const nodeArray = Array.from(this.nodes.values());
        const nodeIndexMap = new Map(nodeArray.map((node, i) => [node.id, i]));

        const nodesJSON = nodeArray.map(node => JSON.parse(node.toJSONString()));

        const edgesJSON = Array.from(this.edges.values()).map(edge => {
            const i = nodeIndexMap.get(edge.node1.id);
            const j = edge.node1.getIndexOfIndexObjectById(edge.node1_indexId);
            const k = nodeIndexMap.get(edge.node2.id);
            const l = edge.node2.getIndexOfIndexObjectById(edge.node2_indexId);
            return [[i, j], [k, l]];
        });

        return JSON.stringify({ nodes: nodesJSON, edges: edgesJSON });
    }

    // Reconstructs a TensorNet from a JSON string produced by toJSONString().
    // Delegates node parsing to TensorNode.fromJSONString(), so all optional node
    // fields (name, idxNames, x/y) are handled the same way as that method allows.
    static fromJSONString(s) {
        const net = new TensorNet();
        const obj = JSON.parse(s);

        // Add nodes in order so that 0-based edge indices remain valid
        const nodeArray = obj.nodes.map(nodeObj => {
            const node = TensorNode.fromJSONString(JSON.stringify(nodeObj));
            net.addNode(node);
            return node;
        });

        // Reconstruct edges using the 0-based node/index positions
        for (const [[i, j], [k, l]] of obj.edges) {
            const node1 = nodeArray[i];
            const node2 = nodeArray[k];
            net.addEdge(new TensorEdge(node1, node1.indices[j].id, node2, node2.indices[l].id));
        }

        return net;
    }

    printNodePairCosts() {
        //console.log("=== Node Pair Contraction Costs ===");

        // Build a map of node pairs that share edges
        const nodePairMap = new Map(); // key is "smaller_id-larger_id"

        for (let [edgeId, edge] of this.edges) {
            let id1 = edge.node1.id;
            let id2 = edge.node2.id;
            let pairKey = id1 < id2 ? `${id1}-${id2}` : `${id2}-${id1}`;

            if (!nodePairMap.has(pairKey)) {
                nodePairMap.set(pairKey, {
                    node1: id1 < id2 ? edge.node1 : edge.node2,
                    node2: id1 < id2 ? edge.node2 : edge.node1,
                    edgeIds: []
                });
            }
            nodePairMap.get(pairKey).edgeIds.push(edgeId);
        }

        // Print costs for each pair
        for (let [pairKey, pairInfo] of nodePairMap) {
            let cost = this.computeContractionCost(pairInfo.node1, pairInfo.node2);
            let edgeIdsStr = pairInfo.edgeIds.join(', ');
            console.log(`Nodes ${pairInfo.node1.id} and ${pairInfo.node2.id}: Edge(s) [${edgeIdsStr}], Cost = ${cost}`);
        }

        //console.log("=== End of Node Pair Costs ===\n");
    }
}

// The COP_ prefix means Contraction Ordering Policy
TensorNet.COP_MIN = 0; // minimal-cost contractions first
TensorNet.COP_MAX = 1; // maximal-cost contractions first
TensorNet.COP_RANDOM = 2; // randomly chosen contractions



TensorNet.PRINT_DEBUG_INFO_1 = false;
TensorNet.PRINT_DEBUG_INFO_2 = false; // more detailed





// Contracts all self-edges on a single node (tensor trace), returning the new replacement node.
// Edges between the node and other nodes are preserved and redirected to the new node.
TensorNet.prototype.performUnaryContraction = function( node ) {
    const net = this;

    // Collect self-edges (node maps to itself in neighboringNodes after addEdge fix)
    const selfEdges = node.neighboringNodes.has(node) ? node.neighboringNodes.get(node).slice() : [];
    if ( selfEdges.length === 0 ) return node;


    const T = node.tensor;
    const rank = T.shape.length;

    // Determine which index positions are traced (contracted) vs free
    const contractedPairs = []; // [ [posA, posB], ... ] - one pair per self-edge
    const contractedPositions = new Set();
    for ( let edge of selfEdges ) {
        const posA = node.getIndexOfIndexObjectById( edge.node1_indexId );
        const posB = node.getIndexOfIndexObjectById( edge.node2_indexId );
        Util.assert( T.shape[posA] === T.shape[posB], "performUnaryContraction(): traced indices have different dimensions" );
        contractedPairs.push( [posA, posB] );
        contractedPositions.add( posA );
        contractedPositions.add( posB );
    }

    const freePositions = [];
    for ( let i = 0; i < rank; i++ ) {
        if ( !contractedPositions.has(i) ) freePositions.push(i);
    }
    const outputShape = freePositions.map( p => T.shape[p] );
    const traceDims   = contractedPairs.map( ([posA]) => T.shape[posA] );

    // Iterate all combinations of an array of dimension sizes; yields index arrays.
    function* iterateCombinations( dims ) {
        if ( dims.length === 0 ) { yield []; return; }
        const indices = new Array( dims.length ).fill(0);
        while ( true ) {
            yield [...indices];
            let carry = 1;
            for ( let i = dims.length - 1; i >= 0 && carry; i-- ) {
                if ( ++indices[i] < dims[i] ) { carry = 0; }
                else { indices[i] = 0; }
            }
            if ( carry ) break;
        }
    }

    // Allocate result tensor (rank-0 for scalar, otherwise the free-index shape)
    const resultTensor = new CTensor( outputShape );

    // Reusable full-index array for reading from T
    const fullIdx = new Array( rank ).fill(0);

    for ( const freeVals of iterateCombinations( outputShape ) ) {
        for ( let j = 0; j < freePositions.length; j++ ) {
            fullIdx[ freePositions[j] ] = freeVals[j];
        }

        let sumRe = 0, sumIm = 0;
        for ( const traceVals of iterateCombinations( traceDims ) ) {
            for ( let k = 0; k < contractedPairs.length; k++ ) {
                const [posA, posB] = contractedPairs[k];
                fullIdx[posA] = traceVals[k];
                fullIdx[posB] = traceVals[k];
            }
            // Compute flat index directly using strides for performance
            let flatIdx = 0;
            for ( let d = 0; d < rank; d++ ) flatIdx += fullIdx[d] * T.strides[d];
            sumRe += T.data[ flatIdx * 2     ];
            sumIm += T.data[ flatIdx * 2 + 1 ];
        }

        let resultFlatIdx = 0;
        for ( let j = 0; j < freeVals.length; j++ ) {
            resultFlatIdx += freeVals[j] * resultTensor.strides[j];
        }
        resultTensor.data[ resultFlatIdx * 2     ] = sumRe;
        resultTensor.data[ resultFlatIdx * 2 + 1 ] = sumIm;
    }

    // Build the index array for the new node (free indices only, preserving id/name/dim/type)
    const newIndexArray = freePositions.map( p => {
        const idx = node.indices[p];
        return { id: idx.id, name: idx.name, dim: idx.dim, indexType: idx.indexType };
    });

    const newNode = new TensorNode( resultTensor, newIndexArray );
    net.addNode( newNode );

    // Remove self-edges from network and from this node's adjacency structures
    for ( let selfEdge of selfEdges ) {
        net.edges.delete( selfEdge.id );
        node.removeIncidentEdge( selfEdge );
    }

    // Redirect remaining (non-self) edges from node to newNode
    for ( let edge of net.edges.values() ) {
        let wasRedirected = false;
        if ( edge.node1 === node ) { edge.node1 = newNode; wasRedirected = true; }
        if ( edge.node2 === node ) { edge.node2 = newNode; wasRedirected = true; }
        if ( wasRedirected ) {
            newNode.addIncidentEdge( edge );
            const otherNode = ( edge.node1 === newNode ) ? edge.node2 : edge.node1;
            if ( otherNode !== newNode ) {
                otherNode.removeIncidentEdge( edge );
                otherNode.addIncidentEdge( edge );
            }
        }
    }

    // Remove old node's reference from its remaining (non-self) neighbors' maps
    for ( const neighbor of node.neighboringNodes.keys() ) {
        if ( neighbor !== node ) {
            neighbor.neighboringNodes.delete( node );
            neighbor.contractionCosts.delete( node );
        }
    }

    // Mark all neighbors of newNode as having dirty costs
    for ( const neighbor of newNode.neighboringNodes.keys() ) {
        neighbor.costsAreDirty = true;
    }
    newNode.costsAreDirty = true;

    net.nodes.delete( node.id );
    return newNode;
}


// Assumptions of this code
//     Assumes that node1 !== node2;
//     Assumes that node1 and node2 share at least one edge;
TensorNet.prototype.performBinaryContraction = function( node1, node2 ) {
    const net = this;

    Util.assert( node1 !== node2, "performBinaryContraction(): the two given nodes are identical" );
    if ( node1 === node2 )
        return;

    // Each index from an input node (either node1 or node2) is either shared between both input nodes,
    // in which case the index is not in the output node (and the index corresponds to a connection a.k.a. a TensorEdge and will be summed over),
    // or it is not shared between the two input nodes,
    // in which case it will be in the output node (and, of course, it is shared by the output node and one of the input nodes).
    // The label below is used to construct the string for einsum.
    //
    // Array of { isSharedWithNode2: boolean, indexWithinNode2: integer, indexForContraction: int, label: character }
    let node1_indices_info = [ ];
    // Array of { isSharedWithNode1: boolean, indexWithinNode1: integer, indexForContraction: int, label: character }
    let node2_indices_info = [ ];
    // Array of { isSharedWithNode1: boolean, indexWithinInputNode: integer, label: character }
    // If isSharedWithNode1 is false, then the index is shared with node2.
    let outputNode_indices_info = [ ];

    for ( let idx of node1.indices ) {
        node1_indices_info.push( { isSharedWithNode2: false /*assume nothing is shared, initially*/ } );
    }
    for ( let idx of node2.indices ) {
        node2_indices_info.push( { isSharedWithNode1: false /*assume nothing is shared, initially*/ } );
    }

    const edgesToContract = net.getAllEdgesBetweenNodes( node1, node2 );
    Util.assert( edgesToContract.length > 0, "performBinaryContraction(): there are no edges in common between the two nodes" );
    if ( edgesToContract.length === 0 )
        return;
    for ( let edge of edgesToContract ) {
        if ( edge.node2 === node1 ) {
            // swap the info in the edge so the subsequent code is less confusing
            edge.swapNodeInfo();
        }
        Util.assert( edge.node1 === node1 && edge.node2 === node2, "performBinaryContraction(): unexpected condition 1" );
        let indexOfIndexOfNode1 = node1.getIndexOfIndexObjectById( edge.node1_indexId );
        let indexOfIndexOfNode2 = node2.getIndexOfIndexObjectById( edge.node2_indexId );
        node1_indices_info[ indexOfIndexOfNode1 ].isSharedWithNode2 = true;
        node2_indices_info[ indexOfIndexOfNode2 ].isSharedWithNode1 = true;
        node1_indices_info[ indexOfIndexOfNode1 ].indexWithinNode2 = indexOfIndexOfNode2;
        node2_indices_info[ indexOfIndexOfNode2 ].indexWithinNode1 = indexOfIndexOfNode1;
    }
    let nextUnusedIndexForContraction = 0;
    let i;
    for ( i = 0; i < node1_indices_info.length; ++i ) {
        node1_indices_info[ i ].indexForContraction = nextUnusedIndexForContraction;
        nextUnusedIndexForContraction ++;
    }
    for ( i = 0; i < node2_indices_info.length; ++i ) {
        if ( node2_indices_info[ i ].isSharedWithNode1 ) {
            node2_indices_info[ i ].indexForContraction = node1_indices_info[ node2_indices_info[ i ].indexWithinNode1 ].indexForContraction;
        }
        else {
            node2_indices_info[ i ].indexForContraction = nextUnusedIndexForContraction;
            nextUnusedIndexForContraction ++;
        }
    }
    // Now construct the input for the contraction subroutine
    let tensor1IndexArrayForContraction = [];
    let tensor2IndexArrayForContraction = [];
    for ( i = 0; i < node1_indices_info.length; ++i ) {
        tensor1IndexArrayForContraction.push( node1_indices_info[ i ].indexForContraction );
    }
    for ( i = 0; i < node2_indices_info.length; ++i ) {
        tensor2IndexArrayForContraction.push( node2_indices_info[ i ].indexForContraction );
    }

    // Perform contraction
    let time1;
    if ( TensorNet.PRINT_DEBUG_INFO_1 )
        time1 = (new Date()).getTime();
    const contractedTensor = CTensor.contract( node1.tensor, node2.tensor, tensor1IndexArrayForContraction, tensor2IndexArrayForContraction );
    if ( TensorNet.PRINT_DEBUG_INFO_1 ) {
        let time2 = (new Date()).getTime();
        let deltaTime = time2 - time1;
        if ( deltaTime > 200 ) {
            console.log(`Time spent on contract(): ${deltaTime} with arrays...`);
            console.log( tensor1IndexArrayForContraction );
            console.log( tensor2IndexArrayForContraction );
        }
    }

    // Build index mappings using IDs
    const node1_indexIds = node1.indices.map( idx => idx.id );
    const node2_indexIds = node2.indices.map( idx => idx.id );

    const contractedIndexIds = new Set(edgesToContract.flatMap(e => [e.node1_indexId, e.node2_indexId]));
    const outputIndexIds = [...node1_indexIds, ...node2_indexIds].filter(
        id => ! contractedIndexIds.has( id )
    );

    if ( TensorNet.PRINT_DEBUG_INFO_2 ) {
        console.log(`Before merging index arrays:`);
        console.log(node1.indices );
        console.log(node2.indices );
    }
    let newIndexArray =
        outputIndexIds.map( id => {
            // Get the full index object from original nodes, preserving the id
            const idx = node1.getIndexObjectById(id) || node2.getIndexObjectById(id);
            return { id: idx.id, name: idx.name, dim: idx.dim, indexType: idx.indexType };
        } );
    if ( TensorNet.PRINT_DEBUG_INFO_2 ) {
        console.log(`Merged newIndexArray:`);
        console.log( newIndexArray );
    }
    const newNode = new TensorNode(
        contractedTensor,
        newIndexArray
    );

    net.addNode( newNode );

    // Collect all affected neighbor nodes (those that will need their costs updated)
    const affectedNeighbors = new Set();

    // Add all neighbors of node1 (except node2)
    for (const neighbor of node1.neighboringNodes.keys()) {
        if (neighbor !== node2) {
            affectedNeighbors.add(neighbor);
        }
    }
    // Add all neighbors of node2 (except node1)
    for (const neighbor of node2.neighboringNodes.keys()) {
        if (neighbor !== node1) {
            affectedNeighbors.add(neighbor);
        }
    }
    // Remove contracted edges
    for ( let contractedEdge of edgesToContract ) {
        net.edges.delete( contractedEdge.id );
        // Remove from both nodes' incident edges
        node1.removeIncidentEdge(contractedEdge);
        node2.removeIncidentEdge(contractedEdge);
    }

    // Redirect remaining edges to new node
    for ( let edge of net.edges.values() ) {
        let wasRedirected = false;

        if ( edge.node1 === node1 || edge.node1 === node2 ) {
            edge.node1 = newNode;
            wasRedirected = true;
        }
        if ( edge.node2 === node1 || edge.node2 === node2 ) {
            edge.node2 = newNode;
            wasRedirected = true;
        }

        // If edge was redirected, update adjacency information
        if (wasRedirected) {
            // Add edge to new node
            newNode.addIncidentEdge(edge);

            // Update adjacency for the other end of the edge
            const otherNode = (edge.node1 === newNode) ? edge.node2 : edge.node1;
            if (otherNode !== newNode) {
                // The other node needs to update its adjacency info
                otherNode.removeIncidentEdge(edge);
                otherNode.addIncidentEdge(edge);
            }
        }
    }

    // Remove node1 and node2 from all their neighbors' neighboringNodes maps
    // This must be done before removing the nodes from the network
    for (const neighbor of node1.neighboringNodes.keys()) {
        if (neighbor !== node2) {  // Skip node2 as it will be deleted anyway
            neighbor.neighboringNodes.delete(node1);
            neighbor.contractionCosts.delete(node1);
        }
    }

    for (const neighbor of node2.neighboringNodes.keys()) {
        if (neighbor !== node1) {  // Skip node1 as it will be deleted anyway
            neighbor.neighboringNodes.delete(node2);
            neighbor.contractionCosts.delete(node2);
        }
    }

    // Remove old nodes
    net.nodes.delete( node1.id );
    net.nodes.delete( node2.id );

    // Mark all affected neighbors as having dirty costs
    for (const neighbor of affectedNeighbors) {
        neighbor.costsAreDirty = true;
    }

    // The new node also needs its costs marked as dirty
    newNode.costsAreDirty = true;

    return newNode;
}


// Replaces the given pair of nodes with their tensor product, while preserving edges to other nodes.
// The two nodes must not share any edges; if they do, an assertion is triggered and the function returns immediately.
// Returns the new node.
TensorNet.prototype.performTensorProduct = function( node1, node2 ) {
    const net = this;

    Util.assert( node1 !== node2, "performTensorProduct(): the two given nodes are identical" );
    if ( node1 === node2 ) return;

    // Forbid any edges between the two nodes
    const edgesBetween = node1.neighboringNodes.has(node2) ? node1.neighboringNodes.get(node2) : [];
    Util.assert( edgesBetween.length === 0, "performTensorProduct(): the two nodes share one or more edges; use performBinaryContraction() instead" );
    if ( edgesBetween.length > 0 ) return;

    // Compute the tensor product and build the combined index array.
    // Index ids are carried over from the original nodes so that all redirected edges
    // (which reference indices by id) remain valid on the new node.
    const productTensor = CTensor.tensorProduct( node1.tensor, node2.tensor );
    const newIndexArray = [ ...node1.indices, ...node2.indices ].map( idx => ({
        id: idx.id, name: idx.name, dim: idx.dim, indexType: idx.indexType
    }));

    const newNode = new TensorNode( productTensor, newIndexArray );
    net.addNode( newNode );

    // Collect affected neighbors (for marking costs dirty later)
    const affectedNeighbors = new Set();
    for ( const neighbor of node1.neighboringNodes.keys() ) affectedNeighbors.add( neighbor );
    for ( const neighbor of node2.neighboringNodes.keys() ) affectedNeighbors.add( neighbor );

    // Redirect all edges that touched node1 or node2 to the new node.
    // Because there are no edges between node1 and node2, every redirected edge
    // has exactly one endpoint in {node1, node2} and one external endpoint.
    for ( let edge of net.edges.values() ) {
        let wasRedirected = false;
        if ( edge.node1 === node1 || edge.node1 === node2 ) { edge.node1 = newNode; wasRedirected = true; }
        if ( edge.node2 === node1 || edge.node2 === node2 ) { edge.node2 = newNode; wasRedirected = true; }
        if ( wasRedirected ) {
            newNode.addIncidentEdge( edge );
            const otherNode = ( edge.node1 === newNode ) ? edge.node2 : edge.node1;
            if ( otherNode !== newNode ) {
                otherNode.removeIncidentEdge( edge );
                otherNode.addIncidentEdge( edge );
            }
        }
    }

    // Remove old nodes' references from their neighbors' maps
    for ( const neighbor of node1.neighboringNodes.keys() ) {
        neighbor.neighboringNodes.delete( node1 );
        neighbor.contractionCosts.delete( node1 );
    }
    for ( const neighbor of node2.neighboringNodes.keys() ) {
        neighbor.neighboringNodes.delete( node2 );
        neighbor.contractionCosts.delete( node2 );
    }

    net.nodes.delete( node1.id );
    net.nodes.delete( node2.id );

    for ( const neighbor of affectedNeighbors ) neighbor.costsAreDirty = true;
    newNode.costsAreDirty = true;

    return newNode;
}

// Accepts any two distinct nodes and combines them intelligently:
//   1. Asserts node1 !== node2.
//   2. Contracts any self-edges on node1, then on node2 (replacing each with its traced version).
//   3. If the (possibly updated) nodes share edges, performs a binary contraction;
//      otherwise performs a tensor product.
// Returns the final combined node.
TensorNet.prototype.performSmartBinaryContraction = function( node1, node2 ) {
    const net = this;

    Util.assert( node1 !== node2, "performSmartBinaryContraction(): the two given nodes are identical" );
    if ( node1 === node2 ) return;

    // Step 2: contract self-edges on each node, updating the local variables if the node is replaced.
    if ( node1.neighboringNodes.has( node1 ) ) {
        node1 = net.performUnaryContraction( node1 );
    }
    if ( node2.neighboringNodes.has( node2 ) ) {
        node2 = net.performUnaryContraction( node2 );
    }

    // Step 3: binary contraction if the nodes share edges, tensor product otherwise.
    const sharedEdges = node1.neighboringNodes.has( node2 ) ? node1.neighboringNodes.get( node2 ) : [];
    if ( sharedEdges.length > 0 ) {
        return net.performBinaryContraction( node1, node2 );
    } else {
        return net.performTensorProduct( node1, node2 );
    }
}


// Finds the next pair of distinct nodes within nodeSet that share at least one edge,
// chosen according to contractionOrderingPolicy.
// Returns [node1, node2, cost] or null if no such pair exists.
TensorNet.prototype._findNextIntraSetConnectedPair = function( nodeSet, contractionOrderingPolicy ) {
    const net = this;

    // Collect unique pairs of distinct nodes (both in nodeSet) sharing at least one edge.
    // Using node object references as Map keys (reference identity) avoids string conversion.
    // The node with the smaller id is always the outer key so each unordered pair is stored once.
    const seenPairs = new Map(); // TensorNode -> Set<TensorNode>
    for ( const edge of net.edges.values() ) {
        if ( edge.node1 === edge.node2 ) continue; // self-edges handled in Phase 1
        if ( nodeSet.has( edge.node1 ) && nodeSet.has( edge.node2 ) ) {
            const [lo, hi] = edge.node1.id < edge.node2.id
                ? [edge.node1, edge.node2]
                : [edge.node2, edge.node1];
            if ( !seenPairs.has(lo) ) seenPairs.set( lo, new Set() );
            seenPairs.get(lo).add(hi);
        }
    }

    if ( seenPairs.size === 0 ) return null;

    const nodePairs = [];
    for ( const [lo, hiSet] of seenPairs ) {
        for ( const hi of hiSet ) {
            nodePairs.push( [lo, hi] );
        }
    }

    if ( contractionOrderingPolicy === TensorNet.COP_RANDOM ) {
        const [ node1, node2 ] = nodePairs[ Math.floor( Math.random() * nodePairs.length ) ];
        return [ node1, node2, net.computeContractionCost( node1, node2 ) ];
    }

    let bestCost, bestTuple = null;
    for ( let i = 0; i < nodePairs.length; i++ ) {
        const [ node1, node2 ] = nodePairs[i];
        const cost = net.computeContractionCost( node1, node2 );
        if (
            i === 0
            || ( contractionOrderingPolicy === TensorNet.COP_MIN && cost < bestCost )
            || ( contractionOrderingPolicy === TensorNet.COP_MAX && cost > bestCost )
        ) {
            bestCost = cost;
            bestTuple = [ node1, node2, cost ];
        }
    }
    return bestTuple;
}


// Finds the best pair of nodes within nodeSet for a tensor product (i.e., they share no edges),
// chosen according to contractionOrderingPolicy.
// Assumes all nodes in nodeSet are mutually disconnected (Phase 3 precondition).
// Returns [node1, node2, cost].
TensorNet.prototype._findNextDisconnectedPairForProduct = function( nodeSet, contractionOrderingPolicy ) {
    const net = this;
    const nodes = Array.from( nodeSet );

    if ( contractionOrderingPolicy === TensorNet.COP_RANDOM ) {
        // Pick two distinct nodes at random
        const i = Math.floor( Math.random() * nodes.length );
        let j = Math.floor( Math.random() * ( nodes.length - 1 ) );
        if ( j >= i ) j++;
        return [ nodes[i], nodes[j], net.computeContractionCost( nodes[i], nodes[j] ) ];
    }

    let bestCost, bestTuple = null;
    let first = true;
    for ( let i = 0; i < nodes.length; i++ ) {
        for ( let j = i + 1; j < nodes.length; j++ ) {
            const cost = net.computeContractionCost( nodes[i], nodes[j] );
            if (
                first
                || ( contractionOrderingPolicy === TensorNet.COP_MIN && cost < bestCost )
                || ( contractionOrderingPolicy === TensorNet.COP_MAX && cost > bestCost )
            ) {
                first = false;
                bestCost = cost;
                bestTuple = [ nodes[i], nodes[j], cost ];
            }
        }
    }
    return bestTuple;
}


// Contracts any subset of nodes in the network (an n-ary contraction).
//
// Parameters:
//   nodeSet                  - Set or array of TensorNode references belonging to this network,
//                              or null to contract the entire network.
//   contractDisconnectedNodes - if true, nodes with no shared edges are combined via tensor product
//                              until only one node remains (default: false).
//   contractionOrderingPolicy - TensorNet.COP_MIN / COP_MAX / COP_RANDOM (default: COP_MIN).
//
// Phase 1: contract self-edges on every node in nodeSet (performUnaryContraction).
// Phase 2: repeatedly pick the cheapest (or priciest, or random) intra-set edge and call
//          performBinaryContraction, until no intra-set edges remain.
// Phase 3: if contractDisconnectedNodes is true, combine remaining nodes with performTensorProduct
//          using the same ordering policy, until only one node remains.
//
// Returns [totalCost, remainingSet] where remainingSet is a Set of the surviving TensorNode(s).
TensorNet.prototype.performNaryContraction = function(
    nodeSet,
    contractDisconnectedNodes = false,
    contractionOrderingPolicy = TensorNet.COP_MIN
) {
    const net = this;

    // Build a mutable working set; null means the entire network.
    const workingSet = new Set(
        nodeSet === null
            ? net.nodes.values()
            : ( nodeSet instanceof Set ? nodeSet : new Set(nodeSet) )
    );

    let totalCost = 0;

    // Eliminate self-edges (traces) on every node
    for ( const node of Array.from( workingSet ) ) {
        if ( node.neighboringNodes.has( node ) ) {
            const cost = net.computeContractionCost( node, node );
            totalCost += cost;
            const newNode = net.performUnaryContraction( node );
            workingSet.delete( node );
            workingSet.add( newNode );
        }
    }

    // Contract all edges between nodes within the working set
    while ( true ) {
        const result = net._findNextIntraSetConnectedPair( workingSet, contractionOrderingPolicy );
        if ( result === null ) break;
        const [ node1, node2, cost ] = result;
        totalCost += cost;
        const newNode = net.performBinaryContraction( node1, node2 );
        workingSet.delete( node1 );
        workingSet.delete( node2 );
        workingSet.add( newNode );
    }

    // Optionally collapse disconnected components via tensor product
    if ( contractDisconnectedNodes ) {
        while ( workingSet.size > 1 ) {
            const [ node1, node2, cost ] = net._findNextDisconnectedPairForProduct( workingSet, contractionOrderingPolicy );
            totalCost += cost;
            const newNode = net.performTensorProduct( node1, node2 );
            workingSet.delete( node1 );
            workingSet.delete( node2 );
            workingSet.add( newNode );
        }
    }

    return [ totalCost, workingSet ];
}


