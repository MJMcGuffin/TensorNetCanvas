
// ============================================================
// Vec2 objects are for storing 2D points and 2D vectors.
// To create a new instance, use the new keyword:
//    let vector_a = new Vec2();
//    let vector_b = new Vec2(x,y);
// These objects are mutable. After an instance has been created,
// its coordinates can be changed by writing directly to data members:
//    vector_a.x = 10;
//    vector_a.y = -2;
// ============================================================
export class Vec2 {
    constructor(x=0,y=0) {
        this.x = x;
        this.y = y;
    }

    // Mutates this from other
    copyFrom(other) {
        this.x = other.x; this.y = other.y;
    }

    // Returns the negation of the vector.
    negated() { return new Vec2(-this.x,-this.y); }

    // Returns the Euclidean length (also called magnitude or L2-norm) of the vector.
    norm() { return Math.sqrt( this.x*this.x + this.y*this.y ); }

    // Returns the squared length.
    // This is useful when the caller needs to compare
    // the length of a vector to a pre-defined threshold,
    // or compare the lengths of two vectors:
    // in such cases, comparing the squared length is sufficient,
    // and saves a square root operation.
    normSquared() { return this.x*this.x + this.y*this.y; }

    // Returns a normalized vector of unit length.
    normalized() {
        let n = this.norm();
        if ( n > 0 ) {
            let k = 1.0/n;
            return new Vec2( k*this.x, k*this.y );
        }
        return new Vec2();
    }

    angle() {
        return Math.atan2(this.y, this.x);
    }

    // A static method that returns the sum of two vectors.
    static sum( v1, v2 ) {
        return new Vec2( v1.x+v2.x, v1.y+v2.y );
    }

    // A static method that returns the difference of two vectors.
    static diff( v1, v2 ) {
        return new Vec2( v1.x-v2.x, v1.y-v2.y );
    }
    // A static method that returns the product of a vector with a scalar.
    static mult( v, k ) {
        return new Vec2( k*v.x, k*v.y );
    }
    // A static method that returns the dot product of two vectors
    static dot( v1, v2 ) {
        return v1.x*v2.x + v1.y*v2.y;
    }
    // A static method that returns the centroid of two vectors
    static average( v1, v2 ) {
        return new Vec2( (v1.x+v2.x)*0.5, (v1.y+v2.y)*0.5 );
    }
    // Returns the centroid of an array of vectors
    static centroid( listOfPoints ) {
        let x = 0;
        let y = 0;
        let N = listOfPoints.length;
        for ( let i = 0; i < N; i ++ ) {
            x += listOfPoints[i].x;
            y += listOfPoints[i].y;
        }
        return new Vec2( x/N, y/N );
    }

    static distance( v1, v2 ) {
        let dx = v1.x - v2.x;
        let dy = v1.y - v2.y;
        return Math.sqrt( dx*dx + dy*dy );
    }
    static distanceSquared( v1, v2 ) {
        let dx = v1.x - v2.x;
        let dy = v1.y - v2.y;
        return dx*dx + dy*dy;
    }
}

// ============================================================
// Box2 objects are for storing 2D axis-aligned rectangles.
// To create a new instance, use the new keyword:
//    let box_a = new Box2();
//    let box_b = new Box2(new Vec2(-10,-10),new Vec2(10,10));
// ============================================================

export class Box2 {
    constructor( vec2_min = null, vec2_max = null ) {
        // Internally, the min and max points are diagonally opposite,
        // and are only valid if isEmpty===false.
        // Below, we initialize things based on what the client passed in.

        this.isEmpty = true;
        this.min = new Vec2();
        this.max = new Vec2();
        if ( vec2_min !== null && vec2_max !== null ) {
            this.boundPoint( vec2_min );
            this.boundPoint( vec2_max );
        }
    }
    clear() { this.isEmpty = true; this.min = new Vec2(); this.max = new Vec2(); }
    center() { return Vec2.average(this.min,this.max); }
    diagonal() { return Vec2.diff(this.max,this.min); }
    width() { return this.max.x - this.min.x; }
    height() { return this.max.y - this.min.y; }

    containsPoint( q ) {
        return !( this.isEmpty || q.x < this.min.x || q.x > this.max.x || q.y < this.min.y || q.y > this.max.y );
    }
    containsBox( b ) {
        if ( this.isEmpty ) return false;
        if ( b.isEmpty ) return true;
        return this.min.x <= b.min.x && b.max.x <= this.max.x && this.min.y <= b.min.y && b.max.y <= this.max.y;
    }

    // Returns true if there is any overlap with the given rectangle
    overlapsBox( b ) {
        if ( this.isEmpty || b.isEmpty ) return false;
        return ! (
            b.max.x < this.min.x
            || b.min.x > this.max.x
            || b.max.y < this.min.y
            || b.min.y > this.max.y
        );
    }

    // Enlarges the box enough to contain the given point
    boundPoint( vec2 ) {
        if ( this.isEmpty ) {
            this.isEmpty = false;
            this.min.copyFrom( vec2 );
            this.max.copyFrom( vec2 );
        }
        else {
            if ( vec2.x < this.min.x ) this.min.x = vec2.x;
            else if ( vec2.x > this.max.x ) this.max.x = vec2.x;

            if ( vec2.y < this.min.y ) this.min.y = vec2.y;
            else if ( vec2.y > this.max.y ) this.max.y = vec2.y;
        }
    }
    boundPoints( points ) {
        for ( let i = 0; i < points.length; ++i ) {
            this.boundPoint( points[i] );
        }
    }

    // Enlarges the box enough to contain the given box
    boundBox( box ) {
        if ( ! box.isEmpty ) {
            this.boundPoint( box.min );
            this.boundPoint( box.max );
        }
    }

    // Find the intersection with the given box and save the result.
    intersectBox( b ) {
        if ( this.isEmpty ) return;
        if ( b.isEmpty ) {
            this.clear();
            return;
        }
        this.min.x = Math.max( this.min.x, b.min.x );
        this.min.y = Math.max( this.min.y, b.min.y );
        this.max.x = Math.min( this.max.x, b.max.x );
        this.max.y = Math.min( this.max.y, b.max.y );
        if ( this.min.x > this.max.x || this.min.y > this.max.y ) {
            this.clear();
        }
    }
}


export class GeomUtil {
    // Returns angle in [0,2 pi] of the given point in the cartesian plane measured counterclockwise+ with respect to x+
    static angleIn2D(x,y) {
        let angle = Math.atan2(y, x);
        if (angle < 0) angle += 2 * Math.PI;
        return angle;
    }
    static isPointInPolygon(px, py, poly) {
        let isInside = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            let xi = poly[i].x;
            let yi = poly[i].y;
            let xj = poly[j].x;
            let yj = poly[j].y;
            if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi))
                isInside = ! isInside;
        }
        return isInside;
    }
}
