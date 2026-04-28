
import { defaultDecimalPrecision, precisionForApproximateComparison } from './globals.js'
import { Util } from './Util.js'
import { GeomUtil } from './GeomUtil.js'
import { StringUtil } from './StringUtil.js'

// Stores a complex number, with real and imaginary components.
export class Complex {
    constructor( re = 0, im = 0 ) {
        this._r = re;
        this._i = im;
    }
    // returns a deep copy of the complex number
    copy() {
        return new Complex( this._r, this._i );
    }
    negate() {
        return new Complex( - this._r, - this._i );
    }
    conjugate() {
        return new Complex( this._r, - this._i );
    }
    mag() { // magnitude, also known as absolute value or modulus
        return Math.sqrt( this._r * this._r + this._i * this._i );
    }
    magSquared() { // magnitude squared
        return this._r * this._r + this._i * this._i;
    }
    arg() { // argument, also called phase, i.e. the angle of the complex number; always in [0,2 pi]
        return GeomUtil.angleIn2D( this._r, this._i );
    }


    // Returns the sum of the two given complex numbers.
    static sum(c1,c2) {
        return new Complex( c1._r+c2._r, c1._i+c2._i );
    }
    // Returns the difference of the two given complex numbers.
    static diff(c1,c2) {
        return new Complex( c1._r-c2._r, c1._i-c2._i );
    }
    // Returns the product of the two given numbers.
    static mult(c1,c2) {
        if ( c1 instanceof Complex ) {
            if ( c2 instanceof Complex ) {
                return new Complex( c1._r*c2._r - c1._i*c2._i, c1._r*c2._i + c1._i*c2._r );
            }
            return new Complex( c1._r * c2, c1._i * c2 );
        }
        else if ( c2 instanceof Complex ) {
            return new Complex( c1 * c2._r, c1 * c2._i );
        }
        return c1 * c2;
    }
    // returns true if the given numbers are approximately equal, within the given tolerance
    static approximatelyEqual(a,b,tolerance=precisionForApproximateComparison,printMessage=true) {
        Util.assert(a instanceof Complex && b instanceof Complex, "Complex.approximatelyEqual(): unknown type");
        let delta = Complex.diff(a,b).mag();
        if ( delta > tolerance ) {
            if ( printMessage ) {
                console.log(`Complex.approximatelyEqual(): difference of ${delta} found`);
            }
            return false;
        }
        return true;
    }
    toString( decimalPrecision = defaultDecimalPrecision ) {
        if ( this._r === 0 ) {
            if ( this._i === 0 ) {
               return "0";
            }
            else {
               return StringUtil.numToString(this._i,decimalPrecision) + "i";
            }
        }
        else {
            if ( this._i === 0 ) {
               return StringUtil.numToString(this._r,decimalPrecision);
            }
            else {
               let rs = StringUtil.numToString(this._r,decimalPrecision);
               let is = StringUtil.numToString(this._i,decimalPrecision) + "i";
               return is[0]==='-' ? ( rs+is ) : ( rs + "+" + is );
            }
        }
    }
    // Parses a string and returns a new Complex number.
    // Handles forms like: "5.2", "7-3.1i", "i", "-i", "-100.2i", "-2+3i", "3i-2"
    static fromString(s) {
        s = s.trim();

        const iIdx = s.indexOf('i');

        if (iIdx === -1) {
            // Pure real number, no imaginary part
            return new Complex(parseFloat(s), 0);
        }

        // Helper: parse imaginary coefficient from a string like "", "+", "-", "3", "-3.1"
        function parseImagCoeff(str) {
            if (str === '' || str === '+') return 1;
            if (str === '-') return -1;
            return parseFloat(str);
        }

        if (iIdx === s.length - 1) {
            // 'i' is at the end: imaginary part is last (e.g., "7-3.1i", "-2+3i", "-100.2i", "i")
            const withoutI = s.slice(0, -1);

            // Find the binary operator between real and imaginary parts:
            // the last '+' or '-' that is not at position 0
            let splitIdx = -1;
            for (let k = withoutI.length - 1; k > 0; k--) {
                if (withoutI[k] === '+' || withoutI[k] === '-') {
                    splitIdx = k;
                    break;
                }
            }

            if (splitIdx === -1) {
                // No real part - purely imaginary (e.g., "i", "-i", "-100.2i")
                return new Complex(0, parseImagCoeff(withoutI));
            }

            return new Complex(
                parseFloat(withoutI.slice(0, splitIdx)),
                parseImagCoeff(withoutI.slice(splitIdx))
            );
        } else {
            // 'i' is not at the end: imaginary part comes first (e.g., "3i-2", "-3i+2")
            const imagCoeffStr = s.slice(0, iIdx);
            const realStr = s.slice(iIdx + 1);
            return new Complex(parseFloat(realStr), parseImagCoeff(imagCoeffStr));
        }
    }

    // Returns true if the string is a valid complex number parseable by Complex.fromString().
    // Valid forms: "5.2", "7-3.1i", "i", "-i", "-100.2i", "-2+3i", "3i-2", etc.
    static isValidString(s) {
        if (typeof s !== 'string') return false;
        s = s.trim();
        if (s === '') return false;

        const num = '(?:\\d+\\.?\\d*|\\.\\d+)'; // unsigned decimal number

        // Pure real: e.g., "5.2", "-2", "0"
        if (new RegExp(`^[+-]?${num}$`).test(s)) return true;

        // Pure imaginary: e.g., "i", "-i", "3i", "-100.2i"
        if (new RegExp(`^[+-]?${num}?i$`).test(s)) return true;

        // Real part then imaginary: e.g., "7-3.1i", "-2+3i", "7-i", "-2+i"
        if (new RegExp(`^[+-]?${num}[+-]${num}?i$`).test(s)) return true;

        // Imaginary part then real: e.g., "3i-2", "-3i+7", "i-2", "-i+3"
        if (new RegExp(`^[+-]?${num}?i[+-]${num}$`).test(s)) return true;

        return false;
    }

}
Complex.i = new Complex(0,1);

