import { defaultDecimalPrecision } from './globals.js'

export class StringUtil {
    static numToString( x, decimalPrecision = defaultDecimalPrecision ) {
        let s1 = x.toString();
        let s2 = x.toFixed(decimalPrecision);
        if ( s1.length < s2.length ) return s1;
        else return s2;
    }
    // returns the given string, reversed
    static reverseString(s) {
        let r = "";
        for ( let j = s.length-1; j >= 0; j-- )
            r += s[j];
        return r;
    }
    // returns s repeated n times
    static repeatString(s,n) {
        let r = "";
        for ( let j = 0; j < n; j++ )
            r += s;
        return r;
    }
    // converts an integer to a binary string, padding with zeros at the front
    static intToBinaryString( i, desiredWidth ) {
        let binaryString = i.toString(2/*base 2 for binary*/);
        return StringUtil.repeatString('0',desiredWidth-binaryString.length) + binaryString; // pad with '0's
    }
    // returns number of times the character c occurs in string s
    static countInString(s,c) {
        let r = 0;
        for ( let j = s.length-1; j >= 0; j-- )
            if ( s[j]===c )
                r ++;
        return r;
    }
    // Search for the nth occurrence in string S of any character from string T, starting at position i in S.
    static findNthOfAny(S, T, i, n, forward = true) {
        const chars = new Set(T);
        const step = forward ? 1 : -1;
        let count = 0;

        // Ensure start index is within bounds
        let k = Math.max(0, Math.min(i, S.length - 1));

        for (; forward ? k < S.length : k >= 0; k += step) {
            if (chars.has(S[k])) {
                count++;
                if (count === n) return k;
            }
        }
        return -1; // Not found
    }
    // Returns a single multiline string containing the given strings
    // concatenated horizontally and centered vertically.
    // Assumes that none of the given strings are jagged,
    // i.e., assumes that for each given string, all its lines are the same length.
    //
    // For example, calling with arguments ("x = ", "[0,0,1,1]", " * ", "[0]\n[1]\n[0]\n[1]")
    // causes a return of the string
    //    "                [0]\n"
    //   +"x = [0,0,1,1] * [1]\n"
    //   +"                [0]\n"
    //   +"                [1]"
    //
    static concatMultiline(...args) {
        let w = []; // widths of given strings
        let h = []; // heights of given strings
        let max_height = 0;
        for (let s of args) {
            let s2 = s.split('\n');
            h.push( s2.length );
            if ( s2.length > max_height ) max_height = s2.length;
            w.push( s2[0].length );
        }
        let returnValue = "";
        for ( let row = 0; row < max_height; ++row ) {
            for (let stringIndex = 0; stringIndex < args.length; stringIndex ++ ) {
                let s = args[ stringIndex ];
                let rowWithinString = Math.round( row - max_height/2 + h[ stringIndex ]/2 );
                if ( rowWithinString < 0 || rowWithinString >= h[ stringIndex ] ) {
                    // use spaces
                    returnValue += StringUtil.repeatString(' ', w[ stringIndex ] );
                }
                else {
                    //console.log("rowWithinString = " + rowWithinString + ", s =" + s + "END" );
                    returnValue += s.split('\n')[rowWithinString];
                }
            }
            if ( row < max_height-1 )
                returnValue += '\n';
        }
        return returnValue;
    }
}
