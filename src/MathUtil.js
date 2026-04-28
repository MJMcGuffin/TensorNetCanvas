import { precisionForApproximateComparison } from './globals.js'
import { Util } from './Util.js'

export class MathUtil {
    // returns true if the given numbers are approximately equal, within the given tolerance
    static approximatelyEqual(a,b,tolerance=precisionForApproximateComparison,printMessage=true) {
        Util.assert(typeof(a)==="number" && typeof(b)==="number", "MathUtil.approximatelyEqual(): unknown type");
        let delta = Math.abs( a - b );
        if ( delta > tolerance ) {
            if ( printMessage ) {
                console.log(`MathUtil.approximatelyEqual(): difference of ${delta} found`);
            }
            return false;
        }
        return true;
    }
    // Boolean lookup table: _isPrimeTable[n] === true iff n is prime.
    // Indices 0 and 1 are pre-filled as false; all integers up to _sievedUpTo have been classified.
    static _isPrimeTable = [false, false];
    static _sievedUpTo = 1;

    // Extends _isPrimeTable to cover all integers up to limit.
    static _extendSieve(limit) {
        if (limit <= MathUtil._sievedUpTo) return;
        for (let candidate = MathUtil._sievedUpTo + 1; candidate <= limit; candidate++) {
            let prime = true;
            for (let p = 2; p * p <= candidate; p++) {
                if (MathUtil._isPrimeTable[p] && candidate % p === 0) { prime = false; break; }
            }
            MathUtil._isPrimeTable[candidate] = prime;
        }
        MathUtil._sievedUpTo = limit;
    }

    // Returns true if n is prime (including the convention that n < 2 returns true,
    // so that dimensions that cannot be split are treated as "prime").
    static isPrime(n) {
        if (n < 2) return true;
        MathUtil._extendSieve(n);
        return MathUtil._isPrimeTable[n];
    }
    // Returns the prime factorization of n as a sorted array with multiplicity.
    // For example, primeFactors(24) returns [2, 2, 2, 3].
    // Returns [] for n < 2.
    static primeFactors(n) {
        const factors = [];
        if (n < 2) return factors;
        MathUtil._extendSieve(Math.ceil(Math.sqrt(n)));
        for (let p = 2; p * p <= n; p++) {
            if (MathUtil._isPrimeTable[p]) {
                while (n % p === 0) { factors.push(p); n = Math.floor(n / p); }
            }
        }
        if (n > 1) factors.push(n);
        return factors;
    }
}
