
import { usingPhysicsConvention, defaultDecimalPrecision, MAX_DECIMAL_PRECISION, precisionForApproximateComparison } from '../globals.js'
import { Util } from '../Util.js'
import { StringUtil } from '../StringUtil.js'
import { CMatrix } from '../CMatrix.js'
import { Complex } from '../Complex.js'


// This is a complex tensor, i.e., a tensor containing complex numbers.
// To save on overhead, the complex numbers are stored as consecutive pairs of numbers in a floating point number array.
export class CTensor {
    constructor( shape /* array of integer dimensions, e.g., [2,2] for a 2x2 matrix */ ) {
        Util.assert( Array.isArray(shape), "CTensor.constructor(): Shape must be an array" );
        for ( let dim of shape ) {
            Util.assert( Number.isInteger(dim) && dim > 0, "CTensor.constructor(): Shape dimensions must be positive integers" );
        }

        this.shape = [...shape]; // deep copy

        // Calculate total number of elements
        this.size = shape.reduce((acc, dim) => acc * dim, 1);

        // Calculate strides for index conversion
        this._computeStrides();

        // Initialize flat array with zeros
        this.data = new Float32Array(
            this.size
            * 2 // because we're storing a real and imaginary component for each tensor element
        );
    }
    _computeStrides() { // computes strides based on the shape
        this.strides = new Array(this.shape.length);
        if (this.shape.length > 0) {
            this.strides[this.shape.length - 1] = 1;
            for (let i = this.shape.length - 2; i >= 0; i--) {
                this.strides[i] = this.strides[i + 1] * this.shape[i + 1];
            }
        }
    }
    reshape( newShape ) {
        Util.assert( Array.isArray(newShape) && newShape.length > 0, "CTensor.reshape(): Shape must be a non-empty array" );
        for ( let dim of newShape ) {
            Util.assert( Number.isInteger(dim) && dim > 0, "CTensor.reshape(): Shape dimensions must be positive integers" );
        }
        let newSize = newShape.reduce((acc, dim) => acc * dim, 1);
        Util.assert( newSize === this.size, "CTensor.reshape(): new shape has invalid size" );
        if ( newSize === this.size ) {
            this.shape = [...newShape]; // deep copy
            this._computeStrides();
        }
    }

    // Convert multi-dimensional indices to flat index
    _indicesToFlatIndex( indices ) {
        Util.assert( Array.isArray(indices) && indices.length === this.shape.length, `CTensor._indicesToFlatIndex(): Expected ${this.shape.length} indices, got ${indices ? indices.length : 0}` );

        let flatIndex = 0;
        for (let i = 0; i < indices.length; i++) {
            const idx = indices[i];
            Util.assert( Number.isInteger(idx) && idx >= 0 && idx < this.shape[i], `CTensor._indicesToFlatIndex(): Index ${idx} out of bounds for dimension ${i} (size ${this.shape[i]})` );
            flatIndex += idx * this.strides[i];
        }
        return flatIndex;
    }

    // Get a complex number at the specified indices
    get( indices ) {
        const flatIndex = this._indicesToFlatIndex(indices);
        const dataIndex = flatIndex * 2;
        return new Complex( this.data[dataIndex], this.data[dataIndex + 1] );
    }

    // Set a complex number at the specified indices
    set( indices, value ) {
        const flatIndex = this._indicesToFlatIndex(indices);
        const dataIndex = flatIndex * 2;

        if ( typeof(value)==='number' ) {
            this.data[dataIndex    ] = value; // real component
            this.data[dataIndex + 1] = 0;
        }
        else if ( typeof(value)==='object' && value instanceof Complex ) {
            this.data[dataIndex    ] = value._r;
            this.data[dataIndex + 1] = value._i;
        }
        else Util.assert( false, "CTensor.set(): unknown type" );
    }

    getRank() { // returns 1 for vector, 2 for matrix
        return this.shape.length;
    }
    getShape() { // example: returns [4,2] if the tensor is a 4x2 matrix
        return [...this.shape]; // returns a copy
    }
    // Returns total number of elements
    getSize() {
        return this.size;
    }

    // Returns a deep copy of the tensor
    copy() {
        let T = new CTensor( this.shape );
        T.data.set( this.data ); // this copies the contents of one to the other
        return T;
    }

    // Converts this tensor to a matrix (only if rank-2)
    toMatrix() {
        Util.assert( this.shape.length === 2, "CTensor.toMatrix(): tensor must be rank-2" );
        let M = new CMatrix( this.shape[0], this.shape[1] );
        // Copy data directly since both use Float32Array with same layout
        M._m.set( this.data );
        return M;
    }

    // This is a generalization of the transpose operation on a matrix.
    // It reorders or permutes the indices.
    // The permutation passed in is an array of integers.
    // If it maps new index positions to old positions, then we call it an inverse map.
    // If the client prefers to pass in a forward map (that maps old index positions to new ones),
    // then the client can set the boolean flag appropriately.
    transpose( permutation, isInverseMap = true ) {
        // Validate permutation array
        Util.assert(Array.isArray(permutation) && permutation.length === this.shape.length,
            `CTensor.transpose(): permutation must be an array of length ${this.shape.length}`);

        // Check that permutation contains all indices exactly once
        const seen = new Set();
        for (let i = 0; i < permutation.length; i++) {
            const idx = permutation[i];
            Util.assert(Number.isInteger(idx) && idx >= 0 && idx < this.shape.length,
                `CTensor.transpose(): invalid index ${idx} in permutation`);
            Util.assert(!seen.has(idx),
                `CTensor.transpose(): duplicate index ${idx} in permutation`);
            seen.add(idx);
        }

        // If permutation is a forward mapping, compute the inverse
        let inversePermutation;
        if (isInverseMap) {
            inversePermutation = permutation;
        } else {
            // Compute inverse: if forward[i] = j, then inverse[j] = i
            inversePermutation = new Array(permutation.length);
            for (let i = 0; i < permutation.length; i++) {
                inversePermutation[permutation[i]] = i;
            }
        }

        // Create new shape by reordering dimensions
        const newShape = new Array(this.shape.length);
        for (let i = 0; i < this.shape.length; i++) {
            newShape[i] = this.shape[inversePermutation[i]];
        }

        // Create new tensor with transposed shape
        const newData = new Float32Array(this.data.length);

        // Helper function to iterate over all index combinations
        const iterateIndices = function*(shape) {
            const indices = new Array(shape.length).fill(0);

            while (true) {
                yield [...indices];

                // Increment indices
                let carry = 1;
                for (let i = shape.length - 1; i >= 0 && carry; i--) {
                    indices[i] += carry;
                    if (indices[i] >= shape[i]) {
                        indices[i] = 0;
                    } else {
                        carry = 0;
                    }
                }
                if (carry) break; // All indices wrapped around
            }
        };

        // Copy data with reordered indices
        for (const oldIndices of iterateIndices(this.shape)) {
            // Map old indices to new indices using inverse permutation
            const newIndices = new Array(this.shape.length);
            for (let i = 0; i < this.shape.length; i++) {
                newIndices[i] = oldIndices[inversePermutation[i]];
            }

            // Get flat indices
            const oldFlatIndex = this._indicesToFlatIndex(oldIndices);

            // Calculate new flat index manually (since we don't have new strides yet)
            let newFlatIndex = 0;
            let stride = 1;
            for (let i = newShape.length - 1; i >= 0; i--) {
                newFlatIndex += newIndices[i] * stride;
                stride *= newShape[i];
            }

            // Copy both real and imaginary parts
            newData[newFlatIndex * 2] = this.data[oldFlatIndex * 2];
            newData[newFlatIndex * 2 + 1] = this.data[oldFlatIndex * 2 + 1];
        }

        // Update tensor with new shape and data
        this.shape = newShape;
        this.data = newData;
        this._computeStrides();
    }

    // returns true if the given tensors are approximately equal, within the given tolerance
    static approximatelyEqual(a,b,tolerance=precisionForApproximateComparison,printMessage=true) {
        Util.assert(a instanceof CTensor && b instanceof CTensor,"CTensor.approximatelyEqual(): wrong type");

        // Compare shapes
        if ( a.shape.length !== b.shape.length ) {
            if ( printMessage ) {
                console.log(`CTensor.approximatelyEqual(): different ranks: ${a.shape.length} vs ${b.shape.length}`);
            }
            return false;
        }
        for ( let i = 0; i < a.shape.length; i++ ) {
            if ( a.shape[i] !== b.shape[i] ) {
                if ( printMessage ) {
                    console.log(`CTensor.approximatelyEqual(): different shapes: [${a.shape}] vs [${b.shape}]`);
                }
                return false;
            }
        }

        // Compare data
        for ( let j = a.data.length-1; j >= 0; j-- ) { // check each component
            let delta = Math.abs( a.data[j] - b.data[j] );
            if ( delta > tolerance ) {
                if ( printMessage ) {
                    console.log(`CTensor.approximatelyEqual(): difference of ${delta} found`);
                }
                return false;
            }
        }
        return true;
    }

    static createRandom( shape ) {
        let T = new CTensor( shape );
        for ( let j = T.data.length-1; j >= 0; j-- ) {
            T.data[j] = 2 * Math.random() - 1;
        }
        return T;
    }

    // Creates and returns a tensor by copying the contents of the given nested array,
    // which can contain numbers or complex numbers.
    static create( nestedArray ) {
        // Helper function to deduce shape from nested arrays
        function deduceShape( arr ) {
            if ( !Array.isArray(arr) ) {
                return [];
            }
            const shape = [arr.length];
            if ( arr.length > 0 && Array.isArray(arr[0]) ) {
                const subShape = deduceShape( arr[0] );
                shape.push( ...subShape );
            }
            return shape;
        }

        // Helper function to recursively set values
        function fillTensor( tensor, arr, indices = [] ) {
            if ( !Array.isArray(arr) ) {
                tensor.set( indices, arr );
            }
            else {
                for ( let i = 0; i < arr.length; i++ ) {
                    fillTensor( tensor, arr[i], [...indices, i] );
                }
            }
        }

        // Deduce shape (empty array = rank-0 scalar)
        const shape = deduceShape( nestedArray );

        // Create tensor and fill it
        const T = new CTensor( shape );
        if ( shape.length === 0 ) {
            // nestedArray is actually a scalar (number or Complex)
            T.set( [], nestedArray );
        } else {
            fillTensor( T, nestedArray );
        }
        return T;
    }

    // The true tensor product of two tensors.
    // If tensor A has shape (a1, a2, ..., an) and tensor B has shape (b1, b2, ..., bm),
    // the result has shape (a1, a2, ..., an, b1, b2, ..., bm)
    static tensorProduct(a, b) {
        Util.assert(a instanceof CTensor && b instanceof CTensor, "CTensor.tensorProduct(): wrong type");

        // Compute the shape of the result
        const resultShape = [...a.shape, ...b.shape];

        // Create the result tensor
        const result = new CTensor(resultShape);

        // Compute the tensor product
        // For each element A[i1,i2,...,in] and B[j1,j2,...,jm],
        // result[i1,i2,...,in,j1,j2,...,jm] = A[i1,i2,...,in] * B[j1,j2,...,jm]

        // Helper function to iterate over all index combinations
        function* iterateIndices(shape) {
            const indices = new Array(shape.length).fill(0);

            while (true) {
                yield [...indices];

                // Increment indices
                let carry = 1;
                for (let i = shape.length - 1; i >= 0 && carry; i--) {
                    indices[i] += carry;
                    if (indices[i] >= shape[i]) {
                        indices[i] = 0;
                    }
                    else {
                        carry = 0;
                    }
                }
                if (carry) break; // All indices wrapped around
            }
        }

        // Iterate over all combinations of indices
        for (const aIndices of iterateIndices(a.shape)) {
            const aValue = a.get(aIndices);

            for (const bIndices of iterateIndices(b.shape)) {
                const bValue = b.get(bIndices);

                // Combine indices and set the product
                const resultIndices = [...aIndices, ...bIndices];
                result.set(resultIndices, Complex.mult(aValue, bValue));
            }
        }

        return result;
    }

    // Method for "Einstein summing", e.g., tensor contraction.
    // Always returns an instance of CTensor.
    // If a rank-0 tensor is returned,
    // then the caller must apply .get([]) to retrieve the scalar value as a number.
    // TODO add examples of notations and what they do.
    static einsum(notation, ...tensors) {
        // Parse the notation
        const parts = notation.split('->');
        Util.assert( parts.length === 2, "CTensor.einsum(): Einsum notation must contain exactly one '->'" );

        const inputSpecs = parts[0].split(',');
        const outputSpec = parts[1];

        // Validate number of tensors
        Util.assert( inputSpecs.length === tensors.length, `CTensor.einsum(): Expected ${inputSpecs.length} tensors, got ${tensors.length}` );

        // Validate that tensors are CTensor instances
        for (let tensor of tensors) {
            Util.assert( tensor instanceof CTensor, "CTensor.einsum(): All inputs must be CTensor instances" );
        }

        // Build index to dimension mapping for each tensor
        const indexToDims = new Map(); // Maps index char to array of [tensorIdx, dimIdx]
        const tensorShapes = [];

        for (let tensorIdx = 0; tensorIdx < tensors.length; tensorIdx++) {
            const spec = inputSpecs[tensorIdx];
            const shape = tensors[tensorIdx].shape;
            tensorShapes.push(shape);

            Util.assert( spec.length === shape.length, `CTensor.einsum(): Tensor ${tensorIdx} has ${shape.length} dimensions but spec '${spec}' has ${spec.length} indices` );

            for (let dimIdx = 0; dimIdx < spec.length; dimIdx++) {
                const indexChar = spec[dimIdx];
                if (!indexToDims.has(indexChar)) {
                    indexToDims.set(indexChar, []);
                }
                indexToDims.get(indexChar).push([tensorIdx, dimIdx]);
            }
        }

        // Validate that repeated indices have matching dimensions
        const indexSizes = new Map();
        for (const [indexChar, positions] of indexToDims) {
            let size = null;
            for (const [tensorIdx, dimIdx] of positions) {
                const dimSize = tensorShapes[tensorIdx][dimIdx];
                if (size === null) {
                    size = dimSize;
                    indexSizes.set(indexChar, size);
                }
                else {
                    Util.assert( size === dimSize, `CTensor.einsum(): Index '${indexChar}' has inconsistent sizes: ${size} and ${dimSize}` );
                }
            }
        }

        // Determine output shape
        const outputShape = [];
        for (const indexChar of outputSpec) {
            Util.assert( indexSizes.has(indexChar), `CTensor.einsum(): Output index '${indexChar}' not found in input indices` );
            outputShape.push(indexSizes.get(indexChar));
        }

        // Create output tensor
        const result = new CTensor(outputShape);

        // Determine which indices to sum over
        const sumIndices = new Set();
        for (const indexChar of indexToDims.keys()) {
            if (!outputSpec.includes(indexChar)) {
                sumIndices.add(indexChar);
            }
        }

        // Helper function to iterate over all index combinations
        function* iterateIndices(ranges) {
            const indices = new Array(ranges.length).fill(0);

            while (true) {
                yield [...indices];

                // Increment indices
                let carry = 1;
                for (let i = ranges.length - 1; i >= 0 && carry; i--) {
                    indices[i] += carry;
                    if (indices[i] >= ranges[i]) {
                        indices[i] = 0;
                    }
                    else {
                        carry = 0;
                    }
                }
                if (carry) break; // All indices wrapped around
            }
        }

        // Compute each output element
        for (const outputIndices of iterateIndices(outputShape)) {
            let sum = new Complex(0, 0);

            // Build the full index assignment including sum indices
            const fullIndexAssignment = new Map();
            for (let i = 0; i < outputSpec.length; i++) {
                fullIndexAssignment.set(outputSpec[i], outputIndices[i]);
            }

            // Iterate over all sum index combinations
            const sumIndexChars = Array.from(sumIndices);
            const sumRanges = sumIndexChars.map(idx => indexSizes.get(idx));

            for (const sumIndexValues of iterateIndices(sumRanges)) {
                // Complete the index assignment with sum indices
                for (let i = 0; i < sumIndexChars.length; i++) {
                    fullIndexAssignment.set(sumIndexChars[i], sumIndexValues[i]);
                }

                // Compute product of tensor elements
                let product = new Complex(1, 0);

                for (let tensorIdx = 0; tensorIdx < tensors.length; tensorIdx++) {
                    const tensor = tensors[tensorIdx];
                    const spec = inputSpecs[tensorIdx];
                    const tensorIndices = [];

                    for (const indexChar of spec) {
                        tensorIndices.push(fullIndexAssignment.get(indexChar));
                    }

                    const element = tensor.get(tensorIndices);
                    product = Complex.mult(product, element);
                }

                sum = Complex.sum(sum, product);
            }

            result.set(outputIndices, sum);
        }

        return result;
    }

    // Optimized tensor contraction for quantum circuit simulation
    // Assumes all indices have dimension 2.
    // @param tensorA - First tensor
    // @param tensorB - Second tensor
    // @param indicesA - Array of integers representing indices of tensorA
    // @param indicesB - Array of integers representing indices of tensorB
    // Shared indices are those with the same integer value in both arrays
    // For example, whereas with einsum, we might contract with a string like "abc,dec->abde",
    // with this method, we would pass in arrays [0,1,2], [4,5,2]
    static contract(tensorA, tensorB, indicesA, indicesB) {
        Util.assert(tensorA instanceof CTensor && tensorB instanceof CTensor, "CTensor.contract(): inputs must be CTensor instances");
        Util.assert(Array.isArray(indicesA) && Array.isArray(indicesB), "CTensor.contract(): indices must be arrays");
        Util.assert(indicesA.length === tensorA.shape.length, "CTensor.contract(): indicesA length must match tensorA rank");
        Util.assert(indicesB.length === tensorB.shape.length, "CTensor.contract(): indicesB length must match tensorB rank");

        // Find shared index positions
        const sharedPositionsA = [];
        const sharedPositionsB = [];

        for (let i = 0; i < indicesA.length; i++) {
            const posInB = indicesB.indexOf(indicesA[i]);
            if (posInB !== -1) {
                sharedPositionsA.push(i);
                sharedPositionsB.push(posInB);
            }
        }

        Util.assert(sharedPositionsA.length > 0, "CTensor.contract(): tensors must share at least one index");

        // Validate that shared indices have matching dimensions
        for (let k = 0; k < sharedPositionsA.length; k++) {
            Util.assert(
                tensorA.shape[sharedPositionsA[k]] === tensorB.shape[sharedPositionsB[k]],
                "CTensor.contract(): shared indices must have matching dimensions"
            );
        }

        // Collect non-shared positions; build output shape from actual dimensions
        const nonSharedPositionsA = [];
        const nonSharedPositionsB = [];
        const outputShape = [];

        for (let i = 0; i < indicesA.length; i++) {
            if (!sharedPositionsA.includes(i)) {
                nonSharedPositionsA.push(i);
                outputShape.push(tensorA.shape[i]);
            }
        }
        for (let i = 0; i < indicesB.length; i++) {
            if (!sharedPositionsB.includes(i)) {
                nonSharedPositionsB.push(i);
                outputShape.push(tensorB.shape[i]);
            }
        }

        const result = new CTensor(outputShape);

        const numShared      = sharedPositionsA.length;
        const numNonSharedA  = nonSharedPositionsA.length;
        const numNonSharedB  = nonSharedPositionsB.length;
        const sharedDims     = sharedPositionsA.map(k => tensorA.shape[k]);
        const totalShared    = sharedDims.reduce((acc, d) => acc * d, 1);

        const dataA      = tensorA.data;
        const dataB      = tensorB.data;
        const dataResult = result.data;
        const stridesA   = tensorA.strides;
        const stridesB   = tensorB.strides;
        const outputSize = result.size;

        for (let outputFlat = 0; outputFlat < outputSize; outputFlat++) {
            // Decode outputFlat into per-axis values (last axis varies fastest),
            // then accumulate base flat-indices into tensorA and tensorB.
            let baseA = 0, baseB = 0;
            let temp = outputFlat;
            for (let i = outputShape.length - 1; i >= 0; i--) {
                const v = temp % outputShape[i];
                temp = Math.floor(temp / outputShape[i]);
                if (i < numNonSharedA) {
                    baseA += v * stridesA[nonSharedPositionsA[i]];
                } else {
                    baseB += v * stridesB[nonSharedPositionsB[i - numNonSharedA]];
                }
            }

            // Sum over all combinations of shared indices
            let sumReal = 0, sumImag = 0;
            for (let sharedFlat = 0; sharedFlat < totalShared; sharedFlat++) {
                let flatA = baseA, flatB = baseB;
                let s = sharedFlat;
                for (let k = numShared - 1; k >= 0; k--) {
                    const sv = s % sharedDims[k];
                    s = Math.floor(s / sharedDims[k]);
                    flatA += sv * stridesA[sharedPositionsA[k]];
                    flatB += sv * stridesB[sharedPositionsB[k]];
                }
                const realA = dataA[flatA * 2],     imagA = dataA[flatA * 2 + 1];
                const realB = dataB[flatB * 2],     imagB = dataB[flatB * 2 + 1];
                // Complex multiplication: (a+bi)(c+di) = (ac-bd) + (ad+bc)i
                sumReal += realA * realB - imagA * imagB;
                sumImag += realA * imagB + imagA * realB;
            }

            dataResult[outputFlat * 2]     = sumReal;
            dataResult[outputFlat * 2 + 1] = sumImag;
        }

        return result;
    }

    toString(
        // this syntax allows for something similar to named parameters
        { binaryPrefixes=false, decimalPrecision=defaultDecimalPrecision, suppressZeros=true/*makes large binary matrices easier to read*/, charToReplaceSuppressedZero='_', singleLine=false }={}
    ) {
        if (singleLine) {
            return this._toStringSingleLine({ decimalPrecision, suppressZeros, charToReplaceSuppressedZero });
        }

        // Handle rank 0 (scalar)
        if (this.shape.length === 0) {
            return this.get([]).toString(decimalPrecision);
        }

        // Handle rank 1 (vector)
        if (this.shape.length === 1) {
            let result = '[';
            for (let i = 0; i < this.shape[0]; i++) {
                if (i > 0) result += ',';
                let val = this.get([i]).toString(decimalPrecision);
                if (suppressZeros && val === '0') {
                    result += charToReplaceSuppressedZero;
                }
                else {
                    result += val;
                }
            }
            result += ']';
            return result;
        }

        // Handle rank 2 (matrix) - delegate to existing CMatrix toString
        if (this.shape.length === 2) {
            return this.toMatrix().toString({ binaryPrefixes, decimalPrecision, suppressZeros, charToReplaceSuppressedZero });
        }

        // Handle higher ranks (3+)
        // We'll display as slices along the first dimensions
        return this._toStringHigherRank({ binaryPrefixes, decimalPrecision, suppressZeros, charToReplaceSuppressedZero });
    }

    // Returns a compact single-line bracket representation parseable by CTensor.fromString().
    // E.g., a 2x2 matrix returns "[[1,0],[-2.5,i]]".
    // Calling CTensor.fromString( T.toString({decimalPrecision:MAX_DECIMAL_PRECISION, suppressZeros:false, singleLine:true}) )
    // reconstructs an identical tensor (to within the requested precision).
    _toStringSingleLine({ decimalPrecision=defaultDecimalPrecision, suppressZeros=true, charToReplaceSuppressedZero='_' }={}) {
        if (this.shape.length === 0) {
            return this.get([]).toString(decimalPrecision);
        }
        const formatLevel = (indices, dim) => {
            const parts = [];
            for (let i = 0; i < this.shape[dim]; i++) {
                const nextIndices = [...indices, i];
                if (dim === this.shape.length - 1) {
                    const val = this.get(nextIndices).toString(decimalPrecision);
                    parts.push((suppressZeros && val === '0') ? charToReplaceSuppressedZero : val);
                } else {
                    parts.push(formatLevel(nextIndices, dim + 1));
                }
            }
            return '[' + parts.join(',') + ']';
        };
        return formatLevel([], 0);
    }

    // Helper method for higher rank tensors
    _toStringHigherRank({ binaryPrefixes=false, decimalPrecision=defaultDecimalPrecision, suppressZeros=true, charToReplaceSuppressedZero='_' }={}) {
        // We'll format as groups of 2D matrices
        // For a rank-3 tensor with shape [a,b,c], we show 'a' matrices of size [b,c]
        // For a rank-4 tensor with shape [a,b,c,d], we show 'a' groups, each containing 'b' matrices of size [c,d]
        // And so on...

        const result = [];

        // Recursive helper to format tensor slices
        const formatSlice = (indices, depth) => {
            if (depth === this.shape.length - 2) {
                // We've reached the last 2 dimensions - format as a matrix
                const rows = this.shape[depth];
                const cols = this.shape[depth + 1];

                // Extract the 2D slice
                const matrixData = [];
                for (let r = 0; r < rows; r++) {
                    const row = [];
                    for (let c = 0; c < cols; c++) {
                        const fullIndices = [...indices, r, c];
                        row.push(this.get(fullIndices));
                    }
                    matrixData.push(row);
                }

                // Create a temporary matrix for formatting
                const tempMatrix = CMatrix.create(matrixData);
                return tempMatrix.toString({ binaryPrefixes: false, decimalPrecision, suppressZeros, charToReplaceSuppressedZero });
            }
            else {
                // We need to go deeper - format groups of slices
                const slices = [];
                const currentDimSize = this.shape[depth];

                for (let i = 0; i < currentDimSize; i++) {
                    const newIndices = [...indices, i];
                    const slice = formatSlice(newIndices, depth + 1);

                    // Add index label
                    let label = '';
                    if (binaryPrefixes && depth === 0) {
                        // For the outermost dimension with binary prefixes
                        const targetWidth = Math.ceil(Math.log2(currentDimSize));
                        let binaryString = StringUtil.intToBinaryString(i, targetWidth);
                        if (usingPhysicsConvention) {
                            binaryString = '|' + StringUtil.reverseString(binaryString) + '>';
                        }
                        else {
                            binaryString = '|' + binaryString + '>';
                        }
                        label = binaryString + ':';
                    }
                    else {
                        // Regular index label
                        label = `[${newIndices.join(',')},...]:`;
                    }

                    // Add the slice with its label
                    if (depth === this.shape.length - 3) {
                        // Direct matrix slice - add label on the same line as first row
                        const sliceLines = slice.split('\n');
                        sliceLines[0] = label + ' ' + sliceLines[0];
                        // Indent other lines to align
                        for (let j = 1; j < sliceLines.length; j++) {
                            sliceLines[j] = ' '.repeat(label.length + 1) + sliceLines[j];
                        }
                        slices.push(sliceLines.join('\n'));
                    }
                    else {
                        // Nested groups - put label on its own line
                        slices.push(label + '\n' + slice.split('\n').map(line => '  ' + line).join('\n'));
                    }
                }

                // Join slices with appropriate spacing
                if (depth === 0) {
                    return slices.join('\n\n');
                }
                else {
                    return slices.join('\n');
                }
            }
        };

        return formatSlice([], 0);
    }

    // Parses a single-line bracket string and returns a new CTensor.
    // Accepts strings produced by toString({singleLine:true}), e.g.:
    //   "[0,1]"                            -> rank-1 tensor (vector) of shape [2]
    //   "[[1,0],[-2.5,i]]"                 -> rank-2 tensor (matrix) of shape [2,2]
    //   "[[[0,1.5],[3i,-0.001i]],...]"     -> rank-3 tensor of shape [2,2,2]
    // Each leaf element is parsed by Complex.fromString().
    static fromString(s) {
        s = s.trim();

        // Recursively parse a bracket-delimited array or a leaf complex number.
        function parseValue(str) {
            str = str.trim();
            if (str.startsWith('[')) {
                Util.assert(str.endsWith(']'), "CTensor.fromString(): expected ']'");
                const inner = str.slice(1, -1).trim();
                if (inner === '') return [];
                // Split by commas at bracket depth 0
                const elements = [];
                let depth = 0;
                let start = 0;
                for (let k = 0; k < inner.length; k++) {
                    if      (inner[k] === '[') depth++;
                    else if (inner[k] === ']') depth--;
                    else if (inner[k] === ',' && depth === 0) {
                        elements.push(parseValue(inner.slice(start, k)));
                        start = k + 1;
                    }
                }
                elements.push(parseValue(inner.slice(start)));
                return elements;
            } else {
                return Complex.fromString(str);
            }
        }

        return CTensor.create(parseValue(s));
    }

    // Returns true if the string is a valid tensor string parseable by CTensor.fromString().
    // Checks bracket structure, shape consistency (all sub-arrays at each level have equal length),
    // and that every leaf element passes Complex.isValidString().
    static isValidString(s) {
        if (typeof s !== 'string') return false;
        s = s.trim();
        if (!s.startsWith('[')) return false;

        // Returns the structural signature of a valid tensor string:
        //   0               - valid leaf (Complex number)
        //   [length, sub]   - valid array whose elements all share the same sub-signature
        //   null            - invalid
        function getStructure(str) {
            str = str.trim();
            if (!str.startsWith('[')) {
                return Complex.isValidString(str) ? 0 : null;
            }
            if (!str.endsWith(']')) return null;

            const inner = str.slice(1, -1).trim();
            if (inner === '') return null; // empty arrays are not valid CTensors

            // Split contents by commas at bracket depth 0
            const elements = [];
            let depth = 0;
            let start = 0;
            for (let k = 0; k < inner.length; k++) {
                if      (inner[k] === '[') depth++;
                else if (inner[k] === ']') { depth--; if (depth < 0) return null; }
                else if (inner[k] === ',' && depth === 0) {
                    elements.push(inner.slice(start, k).trim());
                    start = k + 1;
                }
            }
            if (depth !== 0) return null; // unbalanced brackets
            elements.push(inner.slice(start).trim());

            // All elements must share the same structural signature
            const firstSig = getStructure(elements[0]);
            if (firstSig === null) return null;
            for (let i = 1; i < elements.length; i++) {
                if (!sigsEqual(getStructure(elements[i]), firstSig)) return null;
            }

            return [elements.length, firstSig];
        }

        function sigsEqual(a, b) {
            if (a === null || b === null) return false;
            if (a === 0 && b === 0) return true;
            if (a === 0 || b === 0) return false;
            return a[0] === b[0] && sigsEqual(a[1], b[1]);
        }

        return getStructure(s) !== null;
    }


}


