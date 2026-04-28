
import { CTensor } from './CTensor.js';
import { TensorNode } from './TensorNode.js';
import { TensorEdge } from './TensorEdge.js';
import { CP_CB, CP_ACB, CP_I } from './Circuit.js';

function generateIndexOutName(wire) {
    // return "qubit" + wire + "_out";
    return "out_qubit" + wire;
    // return "out_" + wire;
}

function convertCircuitToTensorNet( circuit, net, prependCircuitWithInput = true, skipIdentities = true ) {

    const NODE_NAME_IDENTITY = "I";
    const NODE_NAME_COPY = "COPY";
    const NODE_NAME_ANTI = "ANTI-COPY";

    const INDEX_NAME_OUT = "out";
    const INDEX_NAME_IN = "in";
    const INDEX_NAME_CONTROL_IN = "control_in";
    const INDEX_NAME_CONTROL_OUT = "control_out";

    // Create nodes for each wire at each layer
    const wireNodes = []; // wireNodes[layer][wire] = node

    // Add input nodes if requested
    let inputDepth = 0;
    if ( prependCircuitWithInput ) {
        inputDepth = 1;
        wireNodes[0] = [];

        // Create input nodes for each wire
        for (let w = 0; w < circuit.numWires; w++) {
            // Create a rank-1 tensor representing |0> state: [1, 0]
            const inputTensor = CTensor.create([1, 0]);

            // Create indices for the input node
            const indices = [
                { name: generateIndexOutName(w), dim: 2, indexType: TensorNode.IT_OUTPUT }
            ];

            const node = new TensorNode(inputTensor, indices);
            node.name = "|0>";
            node.x = 0;
            node.y = w;
            net.addNode(node);
            wireNodes[0][w] = node;
        }
    }

    for (let layerWithinCircuit = 0; layerWithinCircuit < circuit.numStages; layerWithinCircuit++) {
        let layerWithinNet = layerWithinCircuit + inputDepth;
        wireNodes[layerWithinNet] = [];

        // First identify control structure for this layer
        let targetWire = -1;
        let controlWires = [];
        let antiControlWires = [];

        for ( let w = 0; w < circuit.numWires; w++ ) {
            const cell = circuit.cells[w][layerWithinCircuit];
            if ( cell !== null && cell.getCircuitPartID() !== CP_CB && cell.getCircuitPartID() !== CP_ACB && cell.getCircuitPartID() !== CP_I ) targetWire = w;
            else if ( cell !== null && cell.getCircuitPartID() === CP_CB ) controlWires.push(w);
            else if ( cell !== null && cell.getCircuitPartID() === CP_ACB ) antiControlWires.push(w);
        }

        // Create tensors for each wire
        for (let w = 0; w < circuit.numWires; w++) {
            const cell = circuit.cells[w][layerWithinCircuit];
            let tensor, indices;

            wireNodes[layerWithinNet][w] = null;
            let nodeName = "";

            if ( cell === null || cell.getCircuitPartID() === CP_I ) {
                if ( skipIdentities ) {
                    continue;
                }
                // 2x2 identity; T[out,in] = δ(out,in)
                tensor = CTensor.create([[1, 0], [0, 1]]);
                indices = [
                    { name: generateIndexOutName(w), dim: 2, indexType: TensorNode.IT_OUTPUT },
                    { name: INDEX_NAME_IN, dim: 2, indexType: TensorNode.IT_INPUT },
                ];
                nodeName = NODE_NAME_IDENTITY;
            }
            else if ( cell !== null && cell.getCircuitPartID() === CP_CB ) {
                // Control tensor:
                //   T[ctrl,out,in] = δ(in,out) * δ(in,ctrl)
                tensor = new CTensor([2, 2, 2]); // [control_signal, output, input]

                tensor.set([0, 0, 0], 1);
                tensor.set([1, 1, 1], 1);

                indices = [
                    { name: INDEX_NAME_CONTROL_OUT, dim: 2, indexType: TensorNode.IT_CONTROL_OUT },
                    { name: generateIndexOutName(w), dim: 2, indexType: TensorNode.IT_OUTPUT },
                    { name: INDEX_NAME_IN , dim: 2, indexType: TensorNode.IT_INPUT },
                ];
                nodeName = NODE_NAME_COPY;
            }
            else if ( cell !== null && cell.getCircuitPartID() === CP_ACB ) {
                // Anti-control tensor:
                //   T[ctrl,out,in] = δ(in,out) * δ(1-in,ctrl)
                tensor = new CTensor([2, 2, 2]); // [control_signal, output, input]

                tensor.set([1, 0, 0], 1);
                tensor.set([0, 1, 1], 1);

                indices = [
                    { name: INDEX_NAME_CONTROL_OUT, dim: 2, indexType: TensorNode.IT_CONTROL_OUT },
                    { name: generateIndexOutName(w), dim: 2, indexType: TensorNode.IT_OUTPUT },
                    { name: INDEX_NAME_IN, dim: 2, indexType: TensorNode.IT_INPUT },
                ];
                nodeName = NODE_NAME_ANTI;
            }
            else if ( cell !== null && cell.getCircuitPartID() !== CP_CB && cell.getCircuitPartID() !== CP_ACB && cell.getCircuitPartID() !== CP_I ) {
                // Target tensor that applies U
                // when all control inputs are active
                const numControls = controlWires.length;
                const numAntiControls = antiControlWires.length;
                const totalNumControls = numControls + numAntiControls;

                // Shape: [ctrl1, ctrl2, ..., out, in]
                const shape = [...Array(totalNumControls).fill(2), 2, 2];
                tensor = new CTensor(shape);

                // Get the U matrix
                const U = cell.getMatrix(); // This is a CMatrix

                // Fill the tensor
                // We need to iterate over all possible combinations of:
                // - control signals (each 0 or 1)
                // - output state (0 or 1)
                // - input state (0 or 1)
                for (let ctrlBits = 0; ctrlBits < (1 << totalNumControls); ctrlBits++) {

                    for (let o = 0; o < 2; o++) {  // output state
                        for (let i = 0; i < 2; i++) {  // input state
                            const indices = [ ];

                            // Extract individual control bits
                            let allControlsActive = true;

                            // Check regular controls (need all to be 1)
                            for (let c = 0; c < numControls; c++) {
                                const bit = (ctrlBits >> c) & 1;
                                indices.push(bit);
                                if (bit !== 1) allControlsActive = false;
                            }

                            // Check anti-controls (need all to be 1, which means wire is |0>)
                            for (let ac = 0; ac < numAntiControls; ac++) {
                                const bit = (ctrlBits >> (numControls + ac)) & 1;
                                indices.push(bit);
                                if (bit !== 1) allControlsActive = false;
                            }

                            indices.push( o );
                            indices.push( i );

                            // Set tensor value
                            if (allControlsActive) {
                                // Apply U gate
                                tensor.set(indices, U.get(o, i));
                            }
                            else {
                                // Apply identity
                                if (i === o) {
                                    tensor.set(indices, 1);
                                }
                            }
                        }
                    }
                }

                // Set up indices
                indices = [ ];

                // Add control indices in order
                for (let c of controlWires) {
                    indices.push({
                        name: INDEX_NAME_CONTROL_IN , dim: 2, indexType: TensorNode.IT_CONTROL_IN
                    });
                }
                for (let ac of antiControlWires) {
                    indices.push({
                        name: INDEX_NAME_CONTROL_IN, dim: 2, indexType: TensorNode.IT_CONTROL_IN
                    });
                }
                indices.push(
                    { name: generateIndexOutName(w), dim: 2, indexType: TensorNode.IT_OUTPUT }
                );
                indices.push(
                    { name: INDEX_NAME_IN, dim: 2, indexType: TensorNode.IT_INPUT }
                );
                nodeName = cell.getName();
            }

            const node = new TensorNode( tensor, indices );
            node.name = nodeName;
            node.x = layerWithinNet;
            node.y = w;
            net.addNode( node );
            wireNodes[layerWithinNet][w] = node;
        }

        // Add control edges within this layer
        if (targetWire >= 0) {
            const targetNode = wireNodes[ layerWithinNet ][ targetWire ];

            // Connect control wires
            let ctrlIndex = 0;
            for (let c of controlWires) {
                const edge = new TensorEdge(
                    wireNodes[layerWithinNet][c],
                    wireNodes[layerWithinNet][c].indices[0].id,
                    targetNode,
                    targetNode.indices[ctrlIndex].id
                );
                net.addEdge(edge);
                ctrlIndex++;
            }

            // Connect anti-control wires
            for (let ac of antiControlWires) {
                const edge = new TensorEdge(
                    wireNodes[layerWithinNet][ac],
                    wireNodes[layerWithinNet][ac].indices[0].id,
                    targetNode,
                    targetNode.indices[ctrlIndex].id
                );
                net.addEdge(edge);
                ctrlIndex++;
            }
        }
    }


    // Add edges between layers
    let totalLayers = circuit.numStages + inputDepth;
    for (let w = 0; w < circuit.numWires; w++) {
        for ( let l = 0; l < totalLayers - 1;  ) {
            if ( wireNodes[l][w] === null ) continue;

            // find neighboring tensor to the right on the same wire
            let l2;
            for ( l2 = l+1; l2 < totalLayers; l2++ ) {
                if ( wireNodes[l2][w] !== null ) break;
            }
            if ( l2 === totalLayers ) break; // there is no neighbor to the right

            const edge = new TensorEdge(
                wireNodes[l][w],
                wireNodes[l][w].indices.at( ( prependCircuitWithInput && l === 0 ) ? 0 : -2 ).id, // -2 for output
                wireNodes[l2][w],
                wireNodes[l2][w].indices.at(-1).id // last index is for input
            );
            net.addEdge(edge);

            l = l2;
        }
    }

    return net;
}


export { convertCircuitToTensorNet };
