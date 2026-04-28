// test 1
// test 2

import { Util } from '../Util.js'
import { StringUtil } from '../StringUtil.js'
import { Sim } from '../Sim.js'

// The prefix CP means CircuitPart, which could be a gate, or part of a gate (like half a swap), or a control bit.
const CP_EMPTY = -1;
const CP_I = 0; // identity
const CP_CB = 1; // control bit
const CP_ACB = 2; // anticontrol bit
const CP_H = 3; // hadamard
const CP_X = 4; // NOT
const CP_Y = 5;
const CP_Z = 6;
const CP_SX = 7; // "SX" means "Square root of X"
const CP_SY = 8; // "SY" means "Square root of Y"
const CP_SZ = 9; // "SZ" means "Square root of Z"
const CP_SSX = 10; // "SSX" means "Square root of Square root of X", or in other words, fourth root of X
const CP_SSY = 11; // "SSY" means "Square root of Square root of Y", or in other words, fourth root of Y
const CP_SSZ = 12; // "SSZ" means "Square root of Square root of Z", or in other words, fourth root of Z
const CP_invSX = 13; // "inv" means inverse
const CP_invSY = 14;
const CP_invSZ = 15;
const CP_invSSX = 16;
const CP_invSSY = 17;
const CP_invSSZ = 18;
const CP_SWAP = 19;
const CP_XE = 20;
const CP_YE = 21;
const CP_ZE = 22;
const CP_RX = 23;
const CP_RY = 24;
const CP_RZ = 25;
const CP_GP = 26;
const CP_PH = 27;
const CP_ZG = 28;
const CP_YG = 29;
const CP_HG = 30;
const CP_NUM = 31;

class Icon {
    constructor(
        circuitPart_id,
        name, // string
        tooltip, // string
        isParametric, // boolean
        parametersAreInDegrees, // boolean
        matrix, // a 2x2 complex matrix; only for gates that *are* parametric, and hence have a fixed matrix

        // A function that takes one or more parameters and returns a 2x2 complex matrix; only for parametric gates.
        parametricFunctionToGenerateMatrix,

        // Only for parametric gates.
        // An array of objects of the form {
        //    name: ...,
        //    defaultValue: ...,
        //    minValue: ...,
        //    maxValue: ...,
        //    dragIncrement: ...,
        //    snapIncrement: ...
        // }
        paramInfo,

    ) {
        this.circuitPart_id = circuitPart_id;
        this.name = name;
        this.tooltip = tooltip;
        this.isParametric = isParametric;
        this.parametersAreInDegrees = parametersAreInDegrees;
        this.matrix = matrix;
        this.parametricFunctionToGenerateMatrix = parametricFunctionToGenerateMatrix;
        this.paramInfo = paramInfo;
        this.numParameters = paramInfo.length;


    }
    circuitPartFactory() {
        let cp = new CircuitPart();
        cp.parentIcon = this;
        cp.paramValues = [ ];
        for ( let i = 0; i < this.numParameters; ++i ) {
            cp.paramValues[ i ] = this.paramInfo[ i ].defaultValue;
        }
        return cp;
    }
};

let icons = [];

function appendToIcons(
    circuitPart_id,
    name,
    tooltip,
    isParametric,
    parametersAreInDegrees,
    matrix,
    parametricFunctionToGenerateMatrix,
    paramInfo,
) {
    let icon = new Icon( circuitPart_id, name, tooltip, isParametric, parametersAreInDegrees, matrix, parametricFunctionToGenerateMatrix, paramInfo );
    icons.push( icon );
    Util.assert( icons.length-1 === circuitPart_id, "appendToIcons(): invalid index" );
}


appendToIcons(
    CP_I, "I", "Identity", false, false, Sim.I, null, [],
);
appendToIcons(
    CP_CB, "Control bit", "Control bit", false, false, null, null, [ ],
);
appendToIcons(
    CP_ACB, "Anticontrol bit", "Anticontrol bit", false, false, null, null, [ ],
);
appendToIcons(
    CP_H, "H", "Hadamard", false, false, Sim.H, null, [ ],
);
appendToIcons(
    CP_X, "X", "Pauli X; also called NOT", false, false, Sim.X, null, [ ],
);
appendToIcons(
    CP_Y, "Y", "Pauli Y", false, false, Sim.Y, null, [ ],
);
appendToIcons(
    CP_Z, "Z", "Pauli Z = Phase(pi)", false, false, Sim.Z, null, [ ],
);
appendToIcons(
    CP_SX, "X^0.5", "X^0.5; also called V", false, false, Sim.SX, null, [ ],
);
appendToIcons(
    CP_SY, "Y^0.5", "Y^0.5", false, false, Sim.SY, null, [ ],
);
appendToIcons(
    CP_SZ, "Z^0.5", "Z^0.5; also called S = Phase(pi/2)", false, false, Sim.SZ, null, [ ],
);
appendToIcons(
    CP_SSX, "X^0.25", "X^0.25", false, false, Sim.SSX, null, [ ],
);
appendToIcons(
    CP_SSY, "Y^0.25", "Y^0.25", false, false, Sim.SSY, null, [ ],
);
appendToIcons(
    CP_SSZ, "Z^0.25", "Z^0.25; also called T = Phase(pi/4)", false, false, Sim.SSZ, null, [ ],
);
appendToIcons(
    CP_invSX, "X^-0.5", "X^-0.5; also called V^-1", false, false, Sim.invSX, null, [ ],
);
appendToIcons(
    CP_invSY, "Y^-0.5", "Y^-0.5", false, false, Sim.invSY, null, [ ],
);
appendToIcons(
    CP_invSZ, "Z^-0.5", "Z^-0.5; also called S^-1 = Phase(-pi/2)", false, false, Sim.invSZ, null, [ ],
);
appendToIcons(
    CP_invSSX, "X^-0.25", "X^-0.25", false, false, Sim.invSSX, null, [ ],
);
appendToIcons(
    CP_invSSY, "Y^-0.25", "Y^-0.25", false, false, Sim.invSSY, null, [ ],
);
appendToIcons(
    CP_invSSZ, "Z^-0.25", "Z^-0.25; also called T^-1 = Phase(-pi/4)", false, false, Sim.invSSZ, null, [ ],
);
appendToIcons(
    CP_SWAP, "Swap", "Swap", false, false, null, null, [ ],
);


const exponentParamInfo = [{name:"k", defaultValue:0, minValue:-2, maxValue:2, dragIncrement:0.01, snapIncrement:0.125}];
const singleAngleParamInfo = [{name:"angle", defaultValue:0, minValue:-360, maxValue:360, dragIncrement:1, snapIncrement:22.5}];
const twoAngleParamInfo = [{name:"angle1", defaultValue:0, minValue:-360, maxValue:360, dragIncrement:1, snapIncrement:22.5},  {name:"angle2", defaultValue:0, minValue:-360, maxValue:360, dragIncrement:1, snapIncrement:22.5}];

appendToIcons(
    CP_XE, "X^k", "Pauli X exponential", true, false, null, Sim.XE, exponentParamInfo,
);
appendToIcons(
    CP_YE, "Y^k", "Pauli Y exponential", true, false, null, Sim.YE, exponentParamInfo,
);
appendToIcons(
    CP_ZE, "Z^k", "Pauli Z exponential; Z^k = Phase(k pi)", true, false, null, Sim.ZE, exponentParamInfo,
);
appendToIcons(
    CP_RX, "Rx", "Rotation around X", true, true, null, Sim.RX, singleAngleParamInfo,
);
appendToIcons(
    CP_RY, "Ry", "Rotation around Y", true, true, null, Sim.RY, singleAngleParamInfo,
);
appendToIcons(
    CP_RZ, "Rz", "Rotation around Z", true, true, null, Sim.RZ, singleAngleParamInfo,
);
appendToIcons(
    CP_GP, "GP", "Global Phase", true, true, null, Sim.GlobalPhase, singleAngleParamInfo,
);
appendToIcons(
    CP_PH, "Ph", "Phase(theta) = Z^(theta/pi)", true, true, null, Sim.Phase, singleAngleParamInfo,
);
appendToIcons(
    CP_ZG, "Z_G", "Generalized Z", true, true, null, Sim.Z_G, twoAngleParamInfo,
);
appendToIcons(
    CP_YG, "Y_G", "Generalized Y", true, true, null, Sim.Y_G, twoAngleParamInfo,
);
appendToIcons(
    CP_HG, "H_G", "Generalized Hadamard", true, true, null, Sim.H_G, twoAngleParamInfo,
);








const PARAMETRIC_GATE_MARGIN = 0.13;



// These are instantiated inside Icon.circuitPartFactory()
// They contain these data members:
//     parentIcon // a reference to an instance of Icon
//     paramValues // an array of values
class CircuitPart {
    getCircuitPartID() {
        return this.parentIcon.circuitPart_id;
    }
    getName() {
        //if ( this.parentIcon.isParametric ) {
        //    let s = "";
        //    for ( let i = 0; i < this.paramValues.length; ++i ) {
        //        if ( i > 0 )
        //            s += ",";
        //        s += StringUtil.numToString( this.paramValues[i] );
        //    }
        //    return this.parentIcon.name + '(' + s + ')';
        //}
        return this.parentIcon.name;
    }
    getTooltip() {
        return this.parentIcon.tooltip;
    }
    getImage() {
        return this.parentIcon.image;
    }
    isParametric() {
        return this.parentIcon.isParametric;
    }
    getMatrix() {
        if ( this.parentIcon.isParametric ) {
            return this.parentIcon.parametricFunctionToGenerateMatrix.apply( null, this.paramValues );
        }
        return this.parentIcon.matrix;
    }
    getNumParameters() {
        return this.parentIcon.numParameters;
    }
    getMargin() { // used for drawing the gate
        return PARAMETRIC_GATE_MARGIN;
    }
    getHeightOfParameterString() { // used for drawing the gate
        let numLinesOfText = this.parentIcon.numParameters + 1;
        if ( numLinesOfText < 3 ) numLinesOfText = 3;
        return (1-2*PARAMETRIC_GATE_MARGIN) / numLinesOfText;
    }
    // returns rectangle in the world space
    getBoundingRectOfParameterString( i /* index of parameter */, origin /* of gate, in world space */) {
        let h = this.getHeightOfParameterString();
        let x0 = origin.x + PARAMETRIC_GATE_MARGIN;
        let y0 = origin.y + PARAMETRIC_GATE_MARGIN+(1+i)*h;
        return new Box2(
            new Vec2( x0, y0 ),
            new Vec2( origin.x + 1 - PARAMETRIC_GATE_MARGIN, y0 + h )
        );
    }
    getParameterAsString( i ) {
        let s = StringUtil.numToString( this.paramValues[i], 3 );
        if ( this.parentIcon.parametersAreInDegrees )
            s += "°";
        return s;
    }
    getParamInfo( i ) {
        return this.parentIcon.paramInfo[ i ];
    }
}



class Circuit {
    constructor() {
        this.MIN_WIRES = 1;
        this.MAX_WIRES = 16;
        this.MIN_STAGES = 1;
        this.MAX_STAGES = 32;

        this.initializeToEmpty();
        //this.cells = [];
        //for ( let w = 0; w < this.numWires; ++w ) {
        //    this.cells[ w ] = [];
        //    for ( let s = 0; s < this.numStages; ++s ) {
        //        this.cells[w][s] = null;
        //    }
        //}
    }
    initializeToEmpty( desiredNumWires = this.MIN_WIRES, desiredNumStages = this.MIN_STAGES ) {
        this.numWires = desiredNumWires;
        this.numStages = desiredNumStages;
        this.cells = Util.create2DArray( this.numWires, this.numStages, null );
        this.stateVectors = [];
        this.stateVectorsAndStatsAreDirty = true;
    }
    clear() {
        this.initializeToEmpty();
    }
    isCellEmpty(w,s) {
        if ( w === this.numWires ) return true;
        Util.assert( 0 <= w && w < this.numWires && 0 <= s && s < this.numStages, "isCellEmpty(): invalid index" );
        if ( w < 0 || w >= this.numWires || s < 0 || s >= this.numStages ) return true;
        if ( this.cells[w][s] !== null ) return false;
        return true;
    }
    isWireEmpty(w) {
        Util.assert( 0 <= w && w < this.numWires, "isWireEmpty(): invalid index" );
        if ( w < 0 || w >= this.numWires ) return true;
        for ( let s = 0; s < this.numStages; ++s ) {
            if ( this.cells[w][s] !== null ) return false;
        }
        return true;
    }
    isStageEmpty(s) {
        Util.assert( 0 <= s && s < this.numStages, "isStageEmpty(): invalid index" );
        if ( s < 0 || s >= this.numStages ) return true;
        for ( let w = 0; w < this.numWires; ++w ) {
            if ( this.cells[w][s] !== null ) return false;
        }
        return true;
    }
    numSwapPartsInStage(s) {
        Util.assert( 0 <= s && s < this.numStages, "numSwapPartsInStage(): invalid index" );
        if ( s < 0 || s >= this.numStages ) return 0;
        let returnValue = 0;
        for ( let w = 0; w < this.numWires; ++w ) {
            if ( this.getCircuitPartIDOfCell(w,s) === CP_SWAP ) returnValue ++;
        }
        return returnValue;
    }
    addWireAtEnd() {
        if ( this.numWires >= this.MAX_WIRES ) return;
        this.cells.push( Util.create1DArray(this.numStages,null) );
        this.numWires ++;
        this.stateVectorsAndStatsAreDirty = true;
    }
    // inserts a stage before the given stage which can be in the range [0,numStages]
    insertStage(s) {
        Util.assert( 0 <= s && s <= this.numStages, "insertStage() invalid args" );
        if ( this.numStages >= this.MAX_STAGES ) return;
        for ( let w = 0; w < this.numWires; ++w ) {
            this.cells[w].splice( s, 0/*number of items to delete*/, null/*item to insert*/ );
        }
        this.numStages ++;
        this.stateVectorsAndStatsAreDirty = true;
    }
    addStageAtEnd() {
        this.insertStage( this.numStages );
    }
    removeWiresFromEnd( numWiresToRemove ) {
        let maxWiresThatCouldBeRemoved = this.numWires - this.MIN_WIRES;
        if ( numWiresToRemove > maxWiresThatCouldBeRemoved )
            numWiresToRemove = maxWiresThatCouldBeRemoved;
        if ( numWiresToRemove <= 0 ) return;
        this.cells.splice( this.numWires - numWiresToRemove, numWiresToRemove );
        this.numWires -= numWiresToRemove;
        this.stateVectorsAndStatsAreDirty = true;
    }
    removeStagesFromEnd( numStagesToRemove ) {
        let maxStagesThatCouldBeRemoved = this.numStages - this.MIN_STAGES;
        if ( numStagesToRemove > maxStagesThatCouldBeRemoved )
            numStagesToRemove = maxStagesThatCouldBeRemoved;
        if ( numStagesToRemove <= 0 ) return;
        for ( let w = 0; w < this.numWires; ++w ) {
            this.cells[w].splice( this.numStages - numStagesToRemove, numStagesToRemove );
        }
        this.numStages -= numStagesToRemove;
        this.stateVectorsAndStatsAreDirty = true;
    }
    removeAllEmptyWiresAtEnd() {
        let numWiresToRemove = 0;
        let w = this.numWires - 1;
        while ( w >= this.MIN_WIRES && this.isWireEmpty(w) ) {
            numWiresToRemove ++;
            w --;
        }
        this.removeWiresFromEnd( numWiresToRemove );
        this.stateVectorsAndStatsAreDirty = true;
    }
    copyStage(sourceStage,targetStage) {
        Util.assert(
            sourceStage !== targetStage
            && 0 <= sourceStage && sourceStage < this.numStages
            && 0 <= targetStage && targetStage < this.numStages,
            "copyStage(): invalid args"
        );
        if (
            sourceStage === targetStage
            || sourceStage < 0 || sourceStage >= this.numStages
            || targetStage < 0 || targetStage >= this.numStages
        )
            return;
        for ( let w = 0; w < this.numWires; ++w ) {
            this.cells[w][targetStage] = this.cells[w][sourceStage];
        }
        this.stateVectorsAndStatsAreDirty = true;
    }
    removeAllEmptyStages() {
        // find the first non-empty stage
        let targetStage = 0;
        let sourceStage = 0;
        while ( sourceStage < this.numStages && this.isStageEmpty( sourceStage ) ) {
            sourceStage ++;
        }
        while ( sourceStage < this.numStages ) {
            if ( targetStage < sourceStage ) {
                this.copyStage( sourceStage, targetStage );
                targetStage = sourceStage;
            }
            else {
                targetStage ++;
            }
            sourceStage ++;
            while ( sourceStage < this.numStages && this.isStageEmpty( sourceStage ) ) {
                sourceStage ++;
            }
        }
        this.removeStagesFromEnd( this.numStages - targetStage );
        this.stateVectorsAndStatsAreDirty = true;
    }
    compactify() {
        this.removeAllEmptyWiresAtEnd();
        this.removeAllEmptyStages();
        this.stateVectorsAndStatsAreDirty = true;
    }
    // Adds the given part at the given wire and stage, or before the given stage by inserting a new stage.
    // If the boolean flag is false, the part is added *at* the given stage,
    // overwriting whatever part may already be there.
    addCircuitPart(circuitPart,wire,stage,/*boolean*/insertBeforeTheGivenStage) {
        Util.assert(
            0 <= wire && wire < this.MAX_WIRES && 0 <= stage && stage <= this.numStages,
            "addCircuitPart() invalid args"
        );
        if ( wire < 0 || wire >= this.MAX_WIRES || stage < 0 || stage > this.numStages )
            return;
        if ( stage === this.numStages ) {
            this.addStageAtEnd();
        }
        else if ( insertBeforeTheGivenStage ) {
            this.insertStage( stage );
        }
        while ( wire >= this.numWires ) {
            this.addWireAtEnd();
        }
        this.cells[ wire ][ stage ] = circuitPart;
        this.stateVectorsAndStatsAreDirty = true;
    }
    getCellContents(wire,stage) {
        if ( wire < 0 || wire >= this.numWires || stage < 0 || stage >= this.numStages )
            return null;
        return this.cells[ wire ][ stage ];
    }
    getCircuitPartIDOfCell(wire,stage) {
        if ( wire < 0 || wire >= this.numWires || stage < 0 || stage >= this.numStages )
            return CP_EMPTY;
        if ( this.cells[ wire ][ stage ] === null )
            return CP_EMPTY;
        return this.cells[ wire ][ stage ].getCircuitPartID();
    }
    clearCell(wire,stage) {
        Util.assert(
            0 <= wire && 0 <= stage, "clearCell() invalid args"
        );
        if ( wire < 0 || wire >= this.numWires || stage < 0 || stage >= this.numStages )
            return;
        this.cells[ wire ][ stage ] = null;
        this.stateVectorsAndStatsAreDirty = true;
    }
    findFirstEmptyStageFollowedByOnlyEmptyStages() {
        let s = this.numStages;
        while ( s >= 1 && this.isStageEmpty(s-1) )
            s --;
        return s;
    }
    addGate(
        wire,
        circuitPart_id,
        listOfControlBits = [] // a list of pairs of the form [wire_index, flag] where 0<=wire_index<n and flag is true for a control bit and false for an anti-control bit
    ) {
        Util.assert( 0 <= wire, "addGate() invalid args" );
        if ( wire < 0 )
            return;
        let s = this.findFirstEmptyStageFollowedByOnlyEmptyStages();
        this.addCircuitPart( icons[ circuitPart_id ].circuitPartFactory(), wire, s, false );
        for ( let i=0; i < listOfControlBits.length; ++i ) {
            this.addCircuitPart( icons[ listOfControlBits[i][1] ? CP_CB : CP_ACB ].circuitPartFactory(), listOfControlBits[i][0], s, false );
        }
        this.stateVectorsAndStatsAreDirty = true;
    }
    addSwapGate( wire1, wire2 ) {
        Util.assert(
            0 <= wire1 && wire1 !== wire2 && 0 <= wire2,
            "addSwapGate() invalid args"
        );
        if ( wire1 < 0 || wire1 === wire2 || wire2 < 0 )
            return;
        let s = this.findFirstEmptyStageFollowedByOnlyEmptyStages();
        this.addCircuitPart( icons[ CP_SWAP ].circuitPartFactory(), wire1, s, false );
        this.addCircuitPart( icons[ CP_SWAP ].circuitPartFactory(), wire2, s, false );
        this.stateVectorsAndStatsAreDirty = true;
    }
    generateString() {
        let obj = {cols:[]};
        for ( let s = 0; s < this.numStages; ++s ) {
            let thisColumn = [];

            let lastNonEmptyWireInThisLayer = this.numWires - 1;
            while ( this.isCellEmpty(lastNonEmptyWireInThisLayer,s) && lastNonEmptyWireInThisLayer > 0 )
                lastNonEmptyWireInThisLayer --;

            for ( let w = 0; w <= lastNonEmptyWireInThisLayer; ++w ) {
                let circuitPart = this.cells[w][s];
                switch( this.getCircuitPartIDOfCell(w,s) ) {
                case CP_EMPTY: thisColumn.push(1); break; // a 1 without quotes means a blank
                case CP_I:     thisColumn.push("1"); break; // a 1 in quotes means an explicit identity gate
                case CP_CB:    thisColumn.push("•"); break;
                case CP_ACB:   thisColumn.push("◦"); break;
                case CP_X:     thisColumn.push("X"); break;
                case CP_Y:     thisColumn.push("Y"); break;
                case CP_Z:     thisColumn.push("Z"); break;
                case CP_H:     thisColumn.push("H"); break;
                case CP_SWAP:  thisColumn.push("Swap"); break;

                case CP_SSX:   thisColumn.push("X^¼"); break;
                case CP_SX:    thisColumn.push("X^½"); break;
                case CP_SSY:   thisColumn.push("Y^¼"); break;
                case CP_SY:    thisColumn.push("Y^½"); break;
                case CP_SSZ:   thisColumn.push("Z^¼"); break;
                case CP_SZ:    thisColumn.push("Z^½"); break;
                case CP_invSSX:   thisColumn.push("X^-¼"); break;
                case CP_invSX:    thisColumn.push("X^-½"); break;
                case CP_invSSY:   thisColumn.push("Y^-¼"); break;
                case CP_invSY:    thisColumn.push("Y^-½"); break;
                case CP_invSSZ:   thisColumn.push("Z^-¼"); break;
                case CP_invSZ:    thisColumn.push("Z^-½"); break;

                case CP_XE:    thisColumn.push({id:'X^ft', arg: (circuitPart.paramValues[0]).toString() }); break;
                case CP_YE:    thisColumn.push({id:'Y^ft', arg: (circuitPart.paramValues[0]).toString() }); break;
                case CP_ZE:    thisColumn.push({id:'Z^ft', arg: (circuitPart.paramValues[0]).toString() }); break;
                case CP_RX:    thisColumn.push({id:'Rxft', arg: (circuitPart.paramValues[0]/180*Math.PI).toString() }); break;
                case CP_RY:    thisColumn.push({id:'Ryft', arg: (circuitPart.paramValues[0]/180*Math.PI).toString() }); break;
                case CP_RZ:    thisColumn.push({id:'Rzft', arg: (circuitPart.paramValues[0]/180*Math.PI).toString() }); break;
                case CP_PH:    thisColumn.push({id:'Phft', arg: (circuitPart.paramValues[0]/180*Math.PI).toString() }); break; // note that, if we wanted this to work in Quirk, we could convert it to a Z^... gate, but maybe it's better to keep it as a phase gate since that might be more meaningful to the user
                case CP_GP:    thisColumn.push({id:'GPft', arg: (circuitPart.paramValues[0]/180*Math.PI).toString() }); break;
                case CP_ZG:    thisColumn.push({id:'Zgft', arg1: (circuitPart.paramValues[0]/180*Math.PI).toString(), arg2: (circuitPart.paramValues[1]/180*Math.PI).toString() }); break;
                case CP_YG:    thisColumn.push({id:'Ygft', arg1: (circuitPart.paramValues[0]/180*Math.PI).toString(), arg2: (circuitPart.paramValues[1]/180*Math.PI).toString() }); break;
                case CP_HG:    thisColumn.push({id:'Hgft', arg1: (circuitPart.paramValues[0]/180*Math.PI).toString(), arg2: (circuitPart.paramValues[1]/180*Math.PI).toString() }); break;
                }
            }
            obj.cols.push( thisColumn );
        }
        return JSON.stringify( obj );
    }
    constructFromString( circuitString ) {
        this.clear();
        let obj = JSON.parse( circuitString );
        if ( obj.cols !== null ) {

            // URLs from Quirk can contain empty arrays, for example,
            //     https://algassert.com/quirk#circuit={%22cols%22:[[%22X%22],[%22Density2%22],[],[%22Y%22]]}
            // which decodes to
            //     ...circuit={"cols":[["X"],["Density2"],[],["Y"]]}
            //
            // We remove the empty arrays from obj.cols :
            obj.cols = obj.cols.filter(item => item.length > 0);

            for ( let l = 0; l < obj.cols.length; ++l ) {
                for ( let w = 0; w < obj.cols[l].length; ++w ) {
                    let gatePartInString = obj.cols[l][w];
                    let circuitPart_id = CP_I;
                    if ( typeof(gatePartInString)==='number' ) {
                    }
                    else if ( typeof(gatePartInString)==='string' ) {
                        switch(gatePartInString) {
                        case '1': circuitPart_id=CP_I; break;
                        case '•': circuitPart_id=CP_CB; break;
                        case '◦': circuitPart_id=CP_ACB; break;
                        case 'X': circuitPart_id=CP_X; break;
                        case 'Y': circuitPart_id=CP_Y; break;
                        case 'Z': circuitPart_id=CP_Z; break;
                        case 'H': circuitPart_id=CP_H; break;
                        case 'Swap': circuitPart_id=CP_SWAP; break;
                        case 'X^¼': circuitPart_id=CP_SSX; break;
                        case 'Y^¼': circuitPart_id=CP_SSY; break;
                        case 'Z^¼': circuitPart_id=CP_SSZ; break;
                        case 'X^½': circuitPart_id=CP_SX; break;
                        case 'Y^½': circuitPart_id=CP_SY; break;
                        case 'Z^½': circuitPart_id=CP_SZ; break;
                        case 'X^-¼': circuitPart_id=CP_invSSX; break;
                        case 'Y^-¼': circuitPart_id=CP_invSSY; break;
                        case 'Z^-¼': circuitPart_id=CP_invSSZ; break;
                        case 'X^-½': circuitPart_id=CP_invSX; break;
                        case 'Y^-½': circuitPart_id=CP_invSY; break;
                        case 'Z^-½': circuitPart_id=CP_invSZ; break;
                        }
                        this.addCircuitPart( icons[ circuitPart_id ].circuitPartFactory(), w, l, false );
                    }
                    else if ( typeof(gatePartInString)==='object' ) {
                        let argument = parseFloat( gatePartInString.arg );
                        let argument1 = parseFloat( gatePartInString.arg1 );
                        let argument2 = parseFloat( gatePartInString.arg2 );
                        let tempParamValues = [ ];
                        switch(gatePartInString.id) {
                        case 'X^ft':
                            tempParamValues[0] = argument;
                            circuitPart_id = CP_XE;
                            break;
                        case 'Y^ft':
                            tempParamValues[0] = argument;
                            circuitPart_id = CP_YE;
                            break;
                        case 'Z^ft':
                            tempParamValues[0] = argument;
                            circuitPart_id = CP_ZE;
                            break;
                        case 'Rxft':
                            tempParamValues[0] = argument / Math.PI * 180;
                            circuitPart_id = CP_RX;
                            break;
                        case 'Ryft':
                            tempParamValues[0] = argument / Math.PI * 180;
                            circuitPart_id = CP_RY;
                            break;
                        case 'Rzft':
                            tempParamValues[0] = argument / Math.PI * 180;
                            circuitPart_id = CP_RZ;
                            break;
                        case 'Phft':
                            tempParamValues[0] = argument / Math.PI * 180;
                            circuitPart_id = CP_PH;
                            break;
                        case 'GPft':
                            tempParamValues[0] = argument / Math.PI * 180;
                            circuitPart_id = CP_GP;
                            break;
                        case 'Zgft':
                            tempParamValues[0] = argument1 / Math.PI * 180;
                            tempParamValues[1] = argument2 / Math.PI * 180;
                            circuitPart_id = CP_ZG;
                            break;
                        case 'Ygft':
                            tempParamValues[0] = argument1 / Math.PI * 180;
                            tempParamValues[1] = argument2 / Math.PI * 180;
                            circuitPart_id = CP_YG;
                            break;
                        case 'Hgft':
                            tempParamValues[0] = argument1 / Math.PI * 180;
                            tempParamValues[1] = argument2 / Math.PI * 180;
                            circuitPart_id = CP_HG;
                            break;
                        }
                        let circuitPart = icons[ circuitPart_id ].circuitPartFactory();
                        circuitPart.paramValues = tempParamValues;
                        this.addCircuitPart(circuitPart,w,l,false);
                    }
                }
            }
        }
    }
}


export { CP_EMPTY, CP_I, CP_CB, CP_ACB, CP_H, CP_X, CP_Y, CP_Z, CP_SX, CP_SY, CP_SZ, CP_SSX, CP_SSY, CP_SSZ, CP_invSX, CP_invSY, CP_invSZ, CP_invSSX, CP_invSSY, CP_invSSZ, CP_SWAP, CP_XE, CP_YE, CP_ZE, CP_RX, CP_RY, CP_RZ, CP_GP, CP_PH, CP_ZG, CP_YG, CP_HG, CP_NUM, Icon, CircuitPart, Circuit };

