
import { MAX_DECIMAL_PRECISION, MAX_DECIMAL_PRECISION_FOR_CANVAS_POSITIONS } from '../globals.js'
import { Util } from '../Util.js'
import { StringUtil } from '../StringUtil.js'
import { CTensor } from './CTensor.js'

const MAX_LINES_OF_TEXT_IN_TENSOR_NODE_BEFORE_AUTOMATIC_COLLAPSE = 10;


export class TensorNode {
    constructor(
        tensor, // instance of CTensor
        indices // array of instances of { id: integer (assigned by TensorNet.addNode()), name: string (optional descriptive label), dim: integer, indexType: TensorNode.IT_INPUT|IT_OUTPUT|etc. }
    ) {
        this.id = -1; // assigned by TensorNet.addNode()
        this.name = ''; // optional descriptive label
        this.tensor = tensor;
        this.indices = indices;

        this.incidentEdges = []; // Array of TensorEdge references
        this.neighboringNodes = new Map(); // Map from neighboring node to array of edges connecting to it
        this.contractionCosts = new Map(); // Map from neighboring node to contraction cost
        this.costsAreDirty = true; // Initially true, allowing lazy computation

        this.areIDsInitialized = false;        // set to true externally when TensorNet assigns IDs
        this.areCoordinatesInitialized = false; // set to true when x/y are explicitly initialized

        // GUI position on canvas (world coordinates)
        this.x = 0;
        this.y = 0;

        // Collapse state: auto-collapse if tensor text is large
        let _tensorLines = tensor.toString().split('\n').filter(l => l.trim() !== '');
        this.isCollapsed = _tensorLines.length > MAX_LINES_OF_TEXT_IN_TENSOR_NODE_BEFORE_AUTOMATIC_COLLAPSE;

    }

    // Returns an index object from the TensorNode's indices by its unique id. Returns undefined if not found.
    getIndexObjectById( indexId ) {
        return this.indices.find( idx => idx.id === indexId );
    }

    getIndexOfIndexObjectById( indexId ) {
        for ( let i = 0; i < this.indices.length; ++i ) {
            if ( this.indices[ i ].id === indexId )
                return i;
        }
        Util.assert(false,`TensorNode.getIndexOfIndexObjectById(): couldn't find index with id ${indexId}`);
        return -1;
    }

    // Returns an index object from the TensorNode's indices by name. Returns undefined if not found.
    getIndexObjectByName( indexName ) {
        return this.indices.find( idx => idx.name === indexName );
    }

    getIndexOfIndexObjectByName( indexName ) {
        for ( let i = 0; i < this.indices.length; ++i ) {
            if ( this.indices[ i ].name === indexName )
                return i;
        }
        Util.assert(false,`TensorNode.getIndexOfIndexObjectByName(): couldn't find index named "${indexName}"`);
        return -1;
    }

    // Add an incident edge and update neighbor information.
    // Only updates this node, not the other node of the edge.
    addIncidentEdge(edge) {
        // TODO XXX check if edge is already in the array
        this.incidentEdges.push(edge);

        // Determine which node is the neighbor
        const neighbor = (edge.node1 === this) ? edge.node2 : edge.node1;

        // Update neighboring nodes map
        if (!this.neighboringNodes.has(neighbor)) {
            this.neighboringNodes.set(neighbor, []);
        }
        // TODO XXX check if edge is already in the array
        this.neighboringNodes.get(neighbor).push(edge);

        this.costsAreDirty = true;
    }

    // Remove an incident edge and update neighbor information
    // Only updates this node, not the other node of the edge.
    removeIncidentEdge(edge) {
        // Remove from incident edges array
        const edgeIndex = this.incidentEdges.indexOf(edge);
        if (edgeIndex !== -1) { // TODO assert
            this.incidentEdges.splice(edgeIndex, 1);
        }

        // Determine which node is the neighbor
        const neighbor = (edge.node1 === this) ? edge.node2 : edge.node1;

        // Update neighboring nodes map
        if (this.neighboringNodes.has(neighbor)) {
            const neighborEdges = this.neighboringNodes.get(neighbor);
            const neighborEdgeIndex = neighborEdges.indexOf(edge);
            if (neighborEdgeIndex !== -1) { // TODO assert
                neighborEdges.splice(neighborEdgeIndex, 1);
            }

            // If no more edges to this neighbor, remove the neighbor
            if (neighborEdges.length === 0) {
                this.neighboringNodes.delete(neighbor);
                this.contractionCosts.delete(neighbor);
            }
        }

        // Mark costs as dirty since adjacency changed
        this.costsAreDirty = true;
    }

    // Permutes this node's tensor indices according to permutation.
    // Edge integrity is fully preserved: TensorEdge instances reference indices by their stable
    // integer .id, not by their position in this.indices.  transpose() only moves index objects
    // to new positions in the array without modifying the objects themselves, so all incident
    // edges remain valid after the call - no TensorNet-level wrapper is needed.
    transpose( permutation, isInverseMap = true ) {
        // Transpose the underlying tensor
        this.tensor.transpose(permutation, isInverseMap);

        // Reorder the indices array to match the new tensor dimension ordering
        let newIndices;

        if (isInverseMap) {
            // permutation maps new positions to old positions
            // newIndices[i] = oldIndices[permutation[i]]
            newIndices = new Array(this.indices.length);
            for (let i = 0; i < permutation.length; i++) {
                newIndices[i] = this.indices[permutation[i]];
            }
        } else {
            // permutation maps old positions to new positions
            // newIndices[permutation[i]] = oldIndices[i]
            newIndices = new Array(this.indices.length);
            for (let i = 0; i < permutation.length; i++) {
                newIndices[permutation[i]] = this.indices[i];
            }
        }

        this.indices = newIndices;
    }
    transposeLexicographically() {
        const currentNames = this.indices.map(idx => idx.name);

        // Create array of {name, id, originalIndex} and sort by name (with id as tiebreaker)
        const nameIndices = this.indices.map((idx, i) => ({name: idx.name, id: idx.id, originalIndex: i}));
        nameIndices.sort((a, b) => {
            let c = a.name.localeCompare(b.name);
            return c !== 0 ? c : a.id - b.id;
        });

        // Create permutation that maps new position to old position (inverse map)
        const permutation = nameIndices.map(item => item.originalIndex);

        this.transpose( permutation, true );
    }

    // Creates a TensorNode from a user-friendly string.  Two forms are accepted:
    //
    // Form 1 - naked nested array, e.g.:
    //   "[[1,0],[0,1]]"
    // The string is passed directly to CTensor.fromString().  The node gets an empty name
    // and default index names "idx0", "idx1", etc.
    //
    // Form 2 - tuple, e.g.:
    //   "([[1,0],[0,1]],'Identity','row','col')"
    // After the nested array, quoted strings (single or double quotes) are optional.
    // The first quoted string is the node name; subsequent strings are index names.
    // Use "" to skip the node name while still providing index names.
    // If fewer index names are given than the tensor rank, defaults fill in the rest.
    static fromUserString(s) {
        s = s.trim();

        // Helper: scan a string starting at position i for comma/space-separated quoted strings.
        // Returns an array of the unquoted string values found.
        function parseQuotedStrings(str) {
            const result = [];
            let i = 0;
            while (i < str.length) {
                if (str[i] === ' ' || str[i] === ',') { i++; continue; }
                if (str[i] === '"' || str[i] === "'") {
                    const q = str[i++];
                    let val = '';
                    while (i < str.length && str[i] !== q) val += str[i++];
                    i++; // skip closing quote
                    result.push(val);
                } else {
                    break; // unexpected character - stop
                }
            }
            return result;
        }

        let tensorStr, nodeName = '', idxNamesList = [];

        if (s.startsWith('[')) {
            // Form 1: naked nested array
            tensorStr = s;
        } else {
            // Form 2: tuple (nested_array, "name", "idx0", ...)
            Util.assert(s.startsWith('(') && s.endsWith(')'), "TensorNode.fromUserString(): string must start with '[' or be a '(...)' tuple");
            const inner = s.slice(1, -1).trim();
            Util.assert(inner.startsWith('['), "TensorNode.fromUserString(): tuple must begin with a nested array");

            // Find end of nested array by tracking bracket depth
            let depth = 0, arrayEnd = -1;
            for (let k = 0; k < inner.length; k++) {
                if      (inner[k] === '[') depth++;
                else if (inner[k] === ']') { depth--; if (depth === 0) { arrayEnd = k; break; } }
            }
            Util.assert(arrayEnd !== -1, "TensorNode.fromUserString(): unbalanced brackets in nested array");

            tensorStr = inner.slice(0, arrayEnd + 1);
            const quotedStrings = parseQuotedStrings(inner.slice(arrayEnd + 1));
            if (quotedStrings.length > 0) nodeName = quotedStrings[0];
            idxNamesList = quotedStrings.slice(1);
        }

        const tensor = CTensor.fromString(tensorStr);
        const indices = tensor.shape.map((dim, i) => ({
            id: -1,
            name: i < idxNamesList.length ? idxNamesList[i] : `idx${i}`,
            dim,
            indexType: TensorNode.IT_INPUT
        }));
        const node = new TensorNode(tensor, indices);
        node.name = nodeName;
        return node;
    }

    // Returns true if the string is valid input for TensorNode.fromUserString().
    static isValidUserString(s) {
        if (typeof s !== 'string') return false;
        s = s.trim();

        // Helper: try to parse comma/space-separated quoted strings starting at str.
        // Returns the array of unquoted values, or null if any unexpected characters are found.
        function tryParseQuotedStrings(str) {
            const result = [];
            let i = 0;
            while (i < str.length) {
                if (str[i] === ' ' || str[i] === ',') { i++; continue; }
                if (str[i] === '"' || str[i] === "'") {
                    const q = str[i++];
                    let val = '';
                    while (i < str.length && str[i] !== q) val += str[i++];
                    if (i >= str.length) return null; // unclosed quote
                    i++; // skip closing quote
                    result.push(val);
                } else {
                    return null; // unexpected character
                }
            }
            return result;
        }

        // Form 1: naked nested array
        if (s.startsWith('[')) return CTensor.isValidString(s);

        // Form 2: tuple
        if (!s.startsWith('(') || !s.endsWith(')')) return false;
        const inner = s.slice(1, -1).trim();
        if (!inner.startsWith('[')) return false;

        // Find end of the nested array
        let depth = 0, arrayEnd = -1;
        for (let k = 0; k < inner.length; k++) {
            if      (inner[k] === '[') depth++;
            else if (inner[k] === ']') { depth--; if (depth < 0) return false; if (depth === 0) { arrayEnd = k; break; } }
        }
        if (arrayEnd === -1) return false;

        const arrayStr = inner.slice(0, arrayEnd + 1);
        if (!CTensor.isValidString(arrayStr)) return false;

        const quotedStrings = tryParseQuotedStrings(inner.slice(arrayEnd + 1));
        if (quotedStrings === null) return false;

        // First quoted string is node name; rest are index names - count must not exceed rank
        const idxNameCount = Math.max(0, quotedStrings.length - 1);
        const rank = CTensor.fromString(arrayStr).shape.length;
        if (idxNameCount > rank) return false;

        return true;
    }

    // Serializes this node to a JSON string that can be reconstructed by TensorNode.fromJSONString().
    // x and y are included only when areCoordinatesInitialized is true.
    toJSONString() {
        const obj = {
            nestedArray: this.tensor.toString({ decimalPrecision: MAX_DECIMAL_PRECISION, suppressZeros: false, singleLine: true }),
            name: this.name,
            idxNames: this.indices.map(idx => idx.name)
        };
        if (this.areCoordinatesInitialized) {
            obj.x = StringUtil.numToString(this.x, MAX_DECIMAL_PRECISION_FOR_CANVAS_POSITIONS );
            obj.y = StringUtil.numToString(this.y, MAX_DECIMAL_PRECISION_FOR_CANVAS_POSITIONS );
        }
        return JSON.stringify(obj);
    }

    // Creates a TensorNode from a JSON string produced by toJSONString() (or hand-crafted).
    // Expected format:
    //   {"nestedArray":"[[1,0],[0,1]]","name":"Identity","idxNames":["row","col"],"x":"150","y":"200"}
    // Only "nestedArray" is required.  If x and y are both present, areCoordinatesInitialized is set true.
    static fromJSONString(s) {
        const obj = JSON.parse(s);
        Util.assert(typeof obj.nestedArray === 'string', "TensorNode.fromJSONString(): 'nestedArray' must be a string");

        const tensor = CTensor.fromString(obj.nestedArray);
        const idxNames = Array.isArray(obj.idxNames) ? obj.idxNames : [];
        const indices = tensor.shape.map((dim, i) => ({
            id: -1,
            name: i < idxNames.length ? idxNames[i] : `idx${i}`,
            dim,
            indexType: TensorNode.IT_INPUT
        }));

        const node = new TensorNode(tensor, indices);
        if (typeof obj.name === 'string') node.name = obj.name;

        if (typeof obj.x === 'string' && typeof obj.y === 'string') {
            node.x = Number(obj.x);
            node.y = Number(obj.y);
            node.areCoordinatesInitialized = true;
        }

        return node;
    }

    // Returns true if the string is valid input for TensorNode.fromJSONString().
    static isValidJSONString(s) {
        if (typeof s !== 'string') return false;
        let obj;
        try { obj = JSON.parse(s); } catch { return false; }
        if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return false;
        if (typeof obj.nestedArray !== 'string') return false;
        if (!CTensor.isValidString(obj.nestedArray)) return false;
        if ('name' in obj && typeof obj.name !== 'string') return false;
        if ('idxNames' in obj) {
            if (!Array.isArray(obj.idxNames)) return false;
            if (!obj.idxNames.every(n => typeof n === 'string')) return false;
            const rank = CTensor.fromString(obj.nestedArray).shape.length;
            if (obj.idxNames.length > rank) return false;
        }
        // x and y must both be present, or both absent
        const hasX = 'x' in obj, hasY = 'y' in obj;
        if (hasX !== hasY) return false;
        if (hasX && (typeof obj.x !== 'string' || typeof obj.y !== 'string')) return false;
        return true;
    }
}

// The IT_ means Index Type
TensorNode.IT_INPUT = 0;
TensorNode.IT_OUTPUT = 1;
TensorNode.IT_CONTROL_IN = 2;
TensorNode.IT_CONTROL_OUT = 3;


