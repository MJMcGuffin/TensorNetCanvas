export class Util {
    static assert( condition, message ) {
        if ( ! condition ) {
            console.log( "ASSERTION ERROR: " + message );
            console.trace(); // causes line numbers to be printed
        }
    }
    // Creates an array filled with the given initialValue
    static create1DArray( numElements, initialValue ) {
        let array = [];
        if ( initialValue === null ) {
            for ( let i = 0; i < numElements; i++ ) {
                array.push(null);
            }
        }
        else if ( typeof(initialValue) === 'object' ) {
            if ( initialValue instanceof Array ) {
                for ( let i = 0; i < numElements; i++ ) {
                    array.push([...initialValue]);
                }
            }
            else {
                for ( let i = 0; i < numElements; i++ ) {
                    array.push({...initialValue});
                }
            }
        }
        else {
            for ( let i = 0; i < numElements; i++ ) {
                array.push(initialValue);
            }
        }
        return array;
    }
    // Creates a 2D array filled with the given initialValue
    static create2DArray( numColumns, numRows, initialValue ) {
        let array = [];
        if ( initialValue === null ) {
            for ( let c = 0; c < numColumns; c++ ) {
                array.push([]);
                for ( let r = 0; r < numRows; r++ ) {
                    array[c].push(null);
                }
            }
        }
        else if ( typeof(initialValue) === 'object' ) {
            if ( initialValue instanceof Array ) {
                for ( let c = 0; c < numColumns; c++ ) {
                    array.push([]); // adds an empty 1D array at the end of "array"
                    for ( let r = 0; r < numRows; r++ ) {
                        array[c].push([...initialValue]); // added at end of the 1D array "array[c]"
                    }
                }
            }
            else {
                for ( let c = 0; c < numColumns; c++ ) {
                    array.push([]); // adds an empty 1D array at the end of "array"
                    for ( let r = 0; r < numRows; r++ ) {
                        array[c].push({...initialValue}); // added at end of the 1D array "array[c]"
                    }
                }
            }
        }
        else {
            for ( let c = 0; c < numColumns; c++ ) {
                array.push([]); // adds an empty 1D array at the end of "array"
                for ( let r = 0; r < numRows; r++ ) {
                    array[c].push(initialValue); // added at end of the 1D array "array[c]"
                }
            }
        }
        return array;
    }
    // Let n be a power of 2. This returns the reverse of i in binary, with respect to n.
    // For example, if n===16, the reverse of 1 is 8, the reverse of 2 is 4, the reverse of 3 is 12,
    // and the reverse of 0, 6, 9, and 15 leaves each of those numbers unchanged.
    static reverseEndianness(i,n) {
        Util.assert( 0<=i && i<n && 1<=n, `Util.reverseEndianness(): unexpected condition, i===${i}, n===${n}`);
        let result = 0;
        let bit = 1;
        let reversed_bit = n >> 1;
        while ( bit < n ) {
            if ( i & bit )
                result |= reversed_bit;
            bit <<= 1;
            reversed_bit >>= 1;
        }
        Util.assert( bit === n/*this should happen because n should be a power of 2*/, `Util.reverseEndianness(): unexpected condition, n===${n}`);
        return result;
    }
}
