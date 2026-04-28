
import { usingPhysicsConvention, defaultDecimalPrecision, precisionForApproximateComparison } from './globals.js'
import { Util } from './Util.js'
import { StringUtil } from './StringUtil.js'
import { Complex } from './Complex.js'

// This is a complex matrix, i.e., a matrix containing complex numbers.
// To save on overhead, the complex numbers are stored as consecutive pairs of numbers in a floating point number array.
export class CMatrix {

    // allocates space in memory containing zeros
    allocate( numRows, numCols ) {
        this._rows = numRows;
        this._cols = numCols;
        this._m = new Float32Array(
            numRows * numCols
            * 2 // because we're storing a real and imaginary component for each matrix element
        );
    }
    constructor( numRows, numCols ) {
        Util.assert( numRows > 0 && numCols > 0, "CMatrix.constructor(): invalid size requested" );
        this.allocate( numRows, numCols );
    }
    // Gets the value in a cell.
    // row and column indices are zero-based.
    // returns a complex number.
    get(row,col) {
        let j = ( row * this._cols + col )*2;
        return new Complex( this._m[j], this._m[j+1] );
    }
    // Sets the value in a cell.
    // row and column indices are zero-based.
    // The value passed in can be a (real) number or a complex number.
    set(row,col,value) {
        let j = ( row * this._cols + col )*2;
        if ( typeof(value)==='number' ) {
            this._m[j  ] = value; // real component
            this._m[j+1] = 0;
        }
        else if ( typeof(value)==='object' && value instanceof Complex ) {
            this._m[j  ] = value._r;
            this._m[j+1] = value._i;
        }
        else Util.assert(false,"CMatrix.set(): unknown type");
    }
    // Returns a deep copy of the matrix
    copy() {
        let M = new CMatrix( this._rows, this._cols );
        M._m.set( this._m ); // this copies the contents of one to the other
        return M;
    }
    // Returns the transpose of the matrix
    transpose() {
        let M = new CMatrix( this._cols, this._rows );
        for ( let r = 0; r < this._rows; ++r ) {
            for ( let c = 0; c < this._cols; ++c ) {
                M.set( c, r, this.get(r,c) );
            }
        }
        return M;
    }
    conjugate() {
        let M = new CMatrix( this._rows, this._cols );
        for ( let r = 0; r < this._rows; ++r ) {
            for ( let c = 0; c < this._cols; ++c ) {
                M.set( r, c, this.get(r,c).conjugate() );
            }
        }
        return M;
    }
    // Returns the transpose of the matrix, also known as adjoint matrix or transjugate
    conjugateTranspose() {
        let M = new CMatrix( this._cols, this._rows );
        for ( let r = 0; r < this._rows; ++r ) {
            for ( let c = 0; c < this._cols; ++c ) {
                M.set( c, r, this.get(r,c).conjugate() );
            }
        }
        return M;
    }
    // Returns a complex number equal to the trace (i.e., sum of diagonal elements) of a square matrix
    trace() {
        Util.assert( this._rows === this._cols, "CMatrix.trace(): matrix is not square" );
        let returnValue = new Complex();
        for ( let r = 0; r < this._rows; ++r ) {
            returnValue = Complex.sum( returnValue, this.get(r,r) );
        }
        return returnValue;
    }
    reverseEndianness( actuallyReverseThings=true ) { // should only be called on a row vector, column vector, or matrix whose dimensions are powers of 2
        if ( ! actuallyReverseThings )
            return this; // never mind
        let M = new CMatrix( this._rows, this._cols );
        for ( let r = 0; r < this._rows; ++r ) {
            let r2 = Util.reverseEndianness(r,this._rows);
            for ( let c = 0; c < this._cols; ++c ) {
                let c2 = Util.reverseEndianness(c,this._cols);
                M.set( r2, c2, this.get(r,c) );
            }
        }
        return M;
    }
    // Converts this matrix to a rank-2 tensor
    toTensor() {
        let T = new CTensor( [this._rows, this._cols] );
        // Copy data directly since both use Float32Array with same layout
        T.data.set( this._m );
        return T;
    }
    // Returns a multiline string, e.g.,
    // a 4x2 matrix might yield "[0,1+2i]\n[1,1   ]\n[0,2i  ]\n[1,0   ]"
    toString(
        // this syntax allows for something similar to named parameters
        { binaryPrefixes=false, decimalPrecision=defaultDecimalPrecision, suppressZeros=true/*makes large binary matrices easier to read*/, charToReplaceSuppressedZero='_' }={}
    ) {
        let arrayOfPrefixStrings = [];
        if ( binaryPrefixes ) {
            let targetWidth = Math.ceil( Math.log2(this._rows) );
            for ( let r = 0; r < this._rows; ++r ) {
                let binaryString = StringUtil.intToBinaryString( r, targetWidth );
                if ( usingPhysicsConvention )
                    binaryString = '|' + StringUtil.reverseString( binaryString ) + '>';
                else
                    binaryString = '|' + binaryString + '>';
                arrayOfPrefixStrings.push( binaryString );
            }
        }
        let arrayOfArraysOfStrings = [];
        for ( let r = 0; r < this._rows; ++r ) {
            arrayOfArraysOfStrings.push( [] );
            for ( let c = 0; c < this._cols; ++c ) {
                arrayOfArraysOfStrings[r].push( this.get(r,c).toString(decimalPrecision) );
            }
        }
        let maxMaxWidth = 0;
        for ( let c = 0; c < this._cols; ++c ) {
            let maxWidth = 0;
            for ( let r = 0; r < this._rows; ++r ) {
                let w = arrayOfArraysOfStrings[r][c].length;
                if ( w > maxWidth ) {
                    maxWidth = w;
                    if ( maxWidth > maxMaxWidth ) maxMaxWidth = maxWidth;
                }
            }
            // now we know the max width for this column, so we can pad with spaces
            for ( let r = 0; r < this._rows; ++r ) {
                let w = arrayOfArraysOfStrings[r][c].length;
                arrayOfArraysOfStrings[r][c] += StringUtil.repeatString(' ',maxWidth-w);
            }
        }
        // now we have finished padding all the strings with spaces
        // so we can build the multiline string
        let returnValue = '';
        for ( let r = 0; r < this._rows; ++r ) {
            if ( binaryPrefixes )
                returnValue += arrayOfPrefixStrings[r];
            returnValue += '[';
            for ( let c = 0; c < this._cols; ++c ) {
                if ( suppressZeros && maxMaxWidth===1 && arrayOfArraysOfStrings[r][c]==='0' )
                    returnValue += charToReplaceSuppressedZero;
                else
                    returnValue += arrayOfArraysOfStrings[r][c];
                if ( c < this._cols-1 )
                    returnValue += ',';
            }
            returnValue += ']';
            if ( r < this._rows-1 )
                returnValue += '\n';
        }
        return returnValue;
    }


    // Returns the sum of the two given matrices.
    static sum(a,b) {
        Util.assert(a instanceof CMatrix && b instanceof CMatrix,"CMatrix.sum(): wrong type");
        Util.assert(a._rows === b._rows && a._cols === b._cols, "CMatrix.sum(): incompatible dimensions" );
        let M = a.copy();
        for ( let j = M._m.length-1; j >= 0; j-- )
            M._m[j] += b._m[j];
        return M;
    }

    // Returns the difference of the two given matrices.
    static diff(a,b) {
        Util.assert(a instanceof CMatrix && b instanceof CMatrix,"CMatrix.diff(): wrong type");
        Util.assert(a._rows === b._rows && a._cols === b._cols, "CMatrix.diff(): incompatible dimensions" );
        let M = a.copy();
        for ( let j = M._m.length-1; j >= 0; j-- )
            M._m[j] -= b._m[j];
        return M;
    }
    // Returns the product of the two given matrices,
    // or of a matrix with a scalar.
    static mult( a, b ) {
        Util.assert(a instanceof CMatrix || b instanceof CMatrix,"CMatrix.mult(): wrong type");

        if ( !( a instanceof CMatrix ) ) {
            // swap a and b, so that a will be the matrix and b the scalar
            let tmp = b;
            b = a;
            a = tmp;
        }

        if ( typeof(b)==='number' ) {
            let M = a.copy();
            for ( let j = M._m.length-1; j >= 0; j-- )
                M._m[j] *= b;
            return M;
        }
        else if ( b instanceof Complex ) {
            let M = new CMatrix(a._rows,a._cols);
            for ( let r = 0; r < M._rows; r++ ) {
                for ( let c = 0; c < M._cols; c++ ) {
                    let product = Complex.mult(a.get(r,c),b);
                    M.set(r,c,product);
                }
            }
            return M;
        }
        else if ( b instanceof CMatrix ) {
            Util.assert(a._cols === b._rows, "CMatrix.mult(): matrices have incompatible dimensions" );
            let M = new CMatrix(a._rows,b._cols);
            for ( let r = 0; r < M._rows; r++ ) {
                for ( let c = 0; c < M._cols; c++ ) {
                    let dotProduct = new Complex();
                    for ( let k = 0; k < a._cols; ++k ) {
                        // TODO this line creates 4 instances of Complex that ultimately aren't
                        // needed; this could be optimized by expanding and inlining the math ops.
                        dotProduct = Complex.sum(dotProduct,Complex.mult(a.get(r,k),b.get(k,c)));
                    }
                    M.set(r,c,dotProduct);
                }
            }
            return M;
        }
        else Util.assert(false,"CMatrix.mult(): unknown type");
    }
    // The Kronecker product (often informally called the tensor product) of two matrices.
    static kron(a,b,isReversed=false) {
        Util.assert(a instanceof CMatrix && b instanceof CMatrix,"CMatrix.kron(): wrong type");
        if ( isReversed ) {
            let tmp = a;
            a = b;
            b = tmp;
        }
        let numRows = a._rows * b._rows;
        let numCols = a._cols * b._cols;
        let M = new CMatrix(numRows,numCols);
        for ( let ar = 0; ar < a._rows; ar++ ) {
            for ( let br = 0; br < b._rows; br++ ) {
                for ( let ac = 0; ac < a._cols; ac++ ) {
                    for ( let bc = 0; bc < b._cols; bc++ ) {
                        M.set(
                            ar*b._rows + br,
                            ac*b._cols + bc,
                            Complex.mult( a.get(ar,ac), b.get(br,bc) )
                        );
                    }
                }
            }
        }
        return M;
    }
    // Imagine you want to form the product of many matrices m1 x m2 x ... mN
    // You can obtain this product by calling the below routine with argument [m1,m2,...,mN]
    //
    // Since matrix multiplication is associative, we have a choice of computing the product
    // starting with whatever matrices we like.
    // It turns out to be more efficient to compute the product of smaller matrices first.
    // So, this routine searches through the given list for the consecutive pair
    // of smallest matrices, replaces them with their product, and repeats.
    static naryMult( list ) {
        Util.assert( list.length>0 && list[0] instanceof CMatrix, "CMatrix.naryMult(): invalid input" );
        // let totalCost = 0;
        while ( list.length > 1 ) {
            let lowestCost = 0;
            let indexForLowestCost = -1;
            for ( let i = 0; i < list.length-1; ++i ) {
                // compute the cost of computing the product of the ith and (i+1)th matrices
                let cost = list[i]._rows * list[i]._cols * list[i+1]._cols;
                if ( indexForLowestCost < 0 || cost < lowestCost ) {
                    lowestCost = cost;
                    indexForLowestCost = i;
                }
            }
            // Replace the lowest-cost pair of matrices with a single matrix
            let a = list[ indexForLowestCost ];
            let b = list[ indexForLowestCost + 1 ];
            // replace the ith and (i+1)th matrices with their product
            list.splice( indexForLowestCost, 2, CMatrix.mult(a,b) );
            // totalCost += lowestCost;
        }
        // console.log("totalCost: " + totalCost);
        return list[0];
    }
    // Imagine you want to form the Kronecker product of many matrices m1 x m2 x ... mN
    // You can obtain this product by calling the below routine with argument [m1,m2,...,mN]
    //
    // Since the Kronecker product is associative, we have a choice of computing the product
    // starting with whatever matrices we like.
    // It turns out to be more efficient to compute the product of smaller matrices first.
    // So, this routine searches through the given list for the consecutive pair
    // of smallest matrices, replaces them with their product, and repeats.
    static naryKron( list, isReversed=false ) {
        Util.assert( list.length>0 && list[0] instanceof CMatrix, "CMatrix.naryKron(): invalid input" );
        if ( isReversed ) {
            list.reverse();
        }
        // let totalCost = 0;
        while ( list.length > 1 ) {
            let lowestCost = 0;
            let indexForLowestCost = -1;
            for ( let i = 0; i < list.length-1; ++i ) {
                // compute the cost of computing the product of the ith and (i+1)th matrices
                let cost = list[i]._rows * list[i]._cols * list[i+1]._rows * list[i+1]._cols;
                if ( indexForLowestCost < 0 || cost < lowestCost ) {
                    lowestCost = cost;
                    indexForLowestCost = i;
                }
            }
            // Replace the lowest-cost pair of matrices with a single matrix
            let a = list[ indexForLowestCost ];
            let b = list[ indexForLowestCost + 1 ];
            // replace the ith and (i+1)th matrices with their product
            list.splice( indexForLowestCost, 2, CMatrix.kron(a,b) );
            // totalCost += lowestCost;
        }
        // console.log("totalCost: " + totalCost);
        return list[0];
    }
    // TODO This should be improved using exponentiation by squaring or binary exponentiation, and something similar could be done for a power() method that raises a matrix to a given exponent
    static kronPower( matrix, exponent ) {
        Util.assert( exponent>0 && matrix instanceof CMatrix, "CMatrix.kronPower(): invalid input" );
        let list = [];
        for ( let i = 0; i < exponent; ++i ) {
            list.push( matrix );
        }
        return CMatrix.naryKron( list );
    }

    // If the caller needs to know Trace(A * B),
    // this subroutine saves time by only computing the diagonal elements of the matrix product.
    // This is equivalent to taking the transpose of one of the matrices,
    // doing element-wise multiplication, and adding up all the elements in the resulting matrix.
    //
    static traceOfMatrixProduct( A, B ) {
        Util.assert(A._cols === B._rows, "CMatrix.traceOfMatrixProduct(): matrices have incompatible dimensions" );
        Util.assert(A._rows === B._cols, "CMatrix.traceOfMatrixProduct(): matrix product is not square, hence trace is not defined" );
        let product_size = A._rows;
        let returnValue = new Complex();
        for ( let ii = 0; ii < product_size; ii++ ) {
            let dotProduct = new Complex();
            for ( let k = 0; k < A._cols; ++k ) {
                // TODO this line creates 4 instances of Complex that ultimately aren't
                // needed; this could be optimized by expanding and inlining the math ops.
                dotProduct = Complex.sum(dotProduct,Complex.mult(A.get(ii,k),B.get(k,ii)));
            }
            returnValue = Complex.sum( returnValue, dotProduct );
        }
        return returnValue;
    }

    // returns true if the given matrices are approximately equal, within the given tolerance
    static approximatelyEqual(a,b,tolerance=precisionForApproximateComparison,printMessage=true) {
        Util.assert(a instanceof CMatrix && b instanceof CMatrix,"CMatrix.approximatelyEqual(): wrong type");
        Util.assert(a._rows === b._rows && a._cols === b._cols, "CMatrix.approximatelyEqual(): incompatible dimensions" );
        for ( let j = a._m.length-1; j >= 0; j-- ) { // check each component
            let delta = Math.abs( a._m[j] - b._m[j] );
            if ( delta > tolerance ) {
                if ( printMessage ) {
                    console.log(`CMatrix.approximatelyEqual(): difference of ${delta} found`);
                }
                return false;
            }
        }
        return true;
    }


    // Creates and returns a matrix by copying the contents of the given array of arrays,
    // which can contain numbers or complex numbers.
    // Assumes that the given array is not jagged.
    static create( arrayOfArrays ) {
        let numRows = arrayOfArrays.length;
        let numCols = arrayOfArrays[0].length;
        let M = new CMatrix( numRows, numCols );
        for ( let j = 0; j < numRows; ++j ) {
            for ( let k = 0; k < numCols; ++k ) {
                M.set( j, k, arrayOfArrays[j][k] );
            }
        }
        return M;
    }
    // Creates a nx1 size matrix
    static createColVector( array ) {
        return this.create( array.map( x => [ x ] ) );
    }
    // Creates a 1xn size matrix
    static createRowVector( array ) {
        return this.create( [ array ] );
    }
    // Returns an identity matrix of the given size
    static identity( numRows ) {
        let M = new CMatrix( numRows, numRows );
        for ( let k = 0; k < numRows; ++k )
            M.set(k,k,1);
        return M;
    }
}

