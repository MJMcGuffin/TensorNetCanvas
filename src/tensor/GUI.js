import { Util } from '../Util.js'
import { MathUtil } from '../MathUtil.js'
import { StringUtil } from '../StringUtil.js'
import { GeomUtil, Vec2, Box2 } from '../GeomUtil.js'
// import { CMatrix } from '../CMatrix.js'
// import { Complex } from '../Complex.js'
// import { Sim } from '../Sim.js'
import { CTensor } from './CTensor.js'
import { TensorNode } from './TensorNode.js'
import { TensorEdge } from './TensorEdge.js'
import { TensorNet } from './TensorNet.js'
import { Circuit } from './Circuit.js'
import { convertCircuitToTensorNet } from './circuitConversion.js'
import { PopupMenu } from '../PopupMenu.js'
import { PairContractionProcedure } from './PairContractionProcedure.js'



// =====================================================================
// TENSOR NETWORK GUI
// =====================================================================

const INDEX_SQUARE_SIZE = 1.5; // height (and width) of each index square in world units
const NODE_PADDING = 0.3;
const CHAR_HEIGHT = 1.0; // each line of text is ~1 unit high
const FONT_SCALE = 0.75; // font size relative to CHAR_HEIGHT
const MERGED_INDEX_NAME_DELIMITER = ','; // delimiter used when joining/splitting atomic sub-names within an index name
const INDEX_NAME_SEPARATOR = '; '; // separator used between index names in the hover tooltip

const DEFAULT_NODE_BG_OPACITY = 0.8;

const USER_SEL_BORDER_COLOR  = '#ffffff';
const SYS_SEL_BORDER_COLOR   = '#ffee00';
const LASSO_SELECT_COLOR     = '#ffffff';
const EDGE_DRAG_COLOR        = '#ff8000';
const SEL_BORDER_LINE_WIDTH = 3.5;
const SEL_GLOW_OFFSET       = 3; // px outset for the outer highlight rect
const SEL_GLOW_EXTRA_OFFSET = 6; // additional px outset for the second ring when both sel sets apply

const RECT_LASSO_THRESHOLD = 2.0;

const NARY_CONTRACTION_WARNING_THRESHOLD = 5; // nodes; triggers a one-time confirmation dialog

const MODE_NONE = 'none';
const MODE_PAN = 'pan';
const MODE_DRAG_NODE = 'dragNode';
const MODE_CREATE_EDGE = 'dragEdge';
const MODE_RECT_SELECT = 'rectSelect';
const MODE_LASSO_SELECT = 'lasso';

const HIT_TYPE_INDEX = 'index';
const HIT_TYPE_COLLAPSE_BUTTON = 'collapseButton';
const HIT_TYPE_BODY = 'body';

// Add this to the global object so it's accessible for debugging
window.tensorNet = new TensorNet();

export class TensorNetGUI {
    constructor() {
        this.canvasContainer = document.getElementById('canvas-container');
        this.canvas = document.getElementById('tnCanvas');
        this.ctx = this.canvas.getContext('2d');

        // View state
        this.viewCenterWX = 0;
        this.viewCenterWY = 0;
        this.pixelsPerUnit = 20;

        // Selection
        this.userSelectedNodes = new Set();
        this.systemSelectedNodes = new Set();

        // UI lock
        this.isUserInterfaceLocked = false;

        // Interaction
        this.mode = MODE_NONE;
        this.draggedNode = null;
        this.dragStartWX = 0;
        this.dragStartWY = 0;
        this.dragStartPositions = new Map();

        // Edge creation
        this.edgeSrcNode = null;
        this.edgeSrcIdx = -1;
        this.edgeDragEndWX = 0;
        this.edgeDragEndWY = 0;

        // Lasso / rect select
        this.lassoPointsW = [];
        this.lassoTotalDistW = 0;
        this.lassoLastX = 0;
        this.lassoLastY = 0;

        // Tooltip
        this.tooltipEl = document.getElementById('tooltip');
        this.hoveredCollapseNode = null;
        this.nodeUnderCursor = null;

        // View options
        this.showNodeIDs = false;
        this.suppressZeros = false;

        // Spline options
        this.tangentLength = 3.0;
        this.curvature = 0;
        this.nodeBgOpacity = DEFAULT_NODE_BG_OPACITY;

        // Cumulative cost
        this.cumulativeCost = 0;
        this._largeContractionConfirmed = false; // true once user confirms a large n-ary contraction

        // Geometry cache
        this.geomCache = new Map();

        // Active highlights: array of {node, idx} pairs; at most ~4 entries
        this._highlights = [];

        // Canvas-drawn popup context menu
        this.popupMenu = new PopupMenu(() => this.render());

        this._resizeCanvas();
        this.pixelsPerUnit = Math.min(this.canvas.width, this.canvas.height) / 40;

        this._setupCanvasEvents();
        this._setupPanelEvents();
        this._setupResizeHandle();
        this.render();

        this._dragNodeMoved = false;
        this._loadFromURL();
        window.addEventListener('popstate', () => this._loadFromURL());
    }

    _resizeCanvas() {
        const r = this.canvasContainer.getBoundingClientRect();
        this.canvas.width = r.width;
        this.canvas.height = r.height;
    }

    // Coordinate transforms: w means world units, s means screen pixels
    w2sx(wx) { return (wx - this.viewCenterWX) * this.pixelsPerUnit + this.canvas.width / 2; }
    w2sy(wy) { return (wy - this.viewCenterWY) * this.pixelsPerUnit + this.canvas.height / 2; }
    s2wx(sx) { return (sx - this.canvas.width / 2) / this.pixelsPerUnit + this.viewCenterWX; }
    s2wy(sy) { return (sy - this.canvas.height / 2) / this.pixelsPerUnit + this.viewCenterWY; }
    w2sLen(wl) { return wl * this.pixelsPerUnit; }
    s2wLen(sl) { return sl / this.pixelsPerUnit; }

    getVisibleBounds() {
        return {
            left: this.s2wx(0), right: this.s2wx(this.canvas.width),
            top: this.s2wy(0), bottom: this.s2wy(this.canvas.height)
        };
    }

    setUserInterfaceLock(flag) {
        this.isUserInterfaceLocked = flag;
        this._updatePanel();
        this.render();
    }

    // ---- Node geometry (cached) ----
    getNodeGeom(node) {
        let key = node.id + '_' + node.tensor.shape.join(',') + '_' + node.tensor.size
                + '_' + (node.isCollapsed ? 'c' : 'e')
                + '_' + (this.showNodeIDs ? '1' : '0')
                + '_' + (this.suppressZeros ? '1' : '0')
                + '_' + node.name;
        if (this.geomCache.has(key)) return this.geomCache.get(key);

        // Build header line: "Node_name (id=nn), 4×2×3=24"
        let header = '';
        if (node.name) header += node.name;
        if (this.showNodeIDs) header += (header ? ' ' : '') + `(id=${node.id})`;
        const shape = node.tensor.getShape();
        const size = node.tensor.getSize();
        const shapeStr = shape.length > 1 ? ( shape.join('×') + '=' + size ) : String(size);
        header += (header ? ', ' : '') + shapeStr;

        let lines;
        if (node.isCollapsed) {
            lines = [header];
        } else {
            let text = node.tensor.toString({suppressZeros: this.suppressZeros});
            lines = text.split('\n');
            while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
            while (lines.length > 0 && lines[0].trim() === '') lines.shift();
            lines.unshift(header);
        }

        let numLines = Math.max(lines.length, 1);
        let maxLen = 0;
        for (let l of lines) if (l.length > maxLen) maxLen = l.length;

        let charW = CHAR_HEIGHT * FONT_SCALE * 0.602;
        let textW = maxLen * charW + NODE_PADDING * 2;
        let textH = numLines * CHAR_HEIGHT;
        let rank = node.tensor.getRank();
        let idxStripW = rank * INDEX_SQUARE_SIZE;
        let totalW = Math.max(textW, idxStripW) + NODE_PADDING * 2 + NODE_PADDING; // extra NODE_PADDING gap before collapse button
        let totalH = textH + (rank > 0 ? INDEX_SQUARE_SIZE : 0) + NODE_PADDING;

        let g = { lines, numLines, textW, textH, totalW, totalH, rank };
        this.geomCache.set(key, g);
        return g;
    }

    invalidateGeom(node) {
        for (let k of this.geomCache.keys()) {
            if (k.startsWith(node.id + '_')) this.geomCache.delete(k);
        }
    }

    getNodeBounds(node) {
        let g = this.getNodeGeom(node);
        return {
            left: node.x - g.totalW / 2, top: node.y - g.totalH / 2,
            right: node.x + g.totalW / 2, bottom: node.y + g.totalH / 2,
            w: g.totalW, h: g.totalH, textH: g.textH
        };
    }

    getIdxSquareCenter(node, idx) {
        let g = this.getNodeGeom(node);
        let b = this.getNodeBounds(node);
        let stripTop = b.top + g.textH + NODE_PADDING;
        const squareSize = INDEX_SQUARE_SIZE;
        let stripLeft = node.x - (g.rank * squareSize) / 2;
        return { x: stripLeft + (idx + 0.5) * squareSize, y: stripTop + squareSize / 2 };
    }

    getIdxSquareRect(node, idx) {
        let c = this.getIdxSquareCenter(node, idx);
        let h = INDEX_SQUARE_SIZE / 2;
        return { left: c.x - h, top: c.y - h, right: c.x + h, bottom: c.y + h };
    }

    _getCollapseButtonRect(node) {
        let b = this.getNodeBounds(node);
        let btnSize = CHAR_HEIGHT;
        return { left: b.right - btnSize, top: b.top, right: b.right, bottom: b.top + btnSize };
    }

    // ---- Hit testing ----
    hitTest(wx, wy) {
        let nodes = Array.from(tensorNet.nodes.values()).reverse();
        for (let node of nodes) {
            let g = this.getNodeGeom(node);
            let b = this.getNodeBounds(node);
            // Index squares first
            for (let i = 0; i < g.rank; i++) {
                let r = this.getIdxSquareRect(node, i);
                if (wx >= r.left && wx <= r.right && wy >= r.top && wy <= r.bottom)
                    return { node, hitType: HIT_TYPE_INDEX, indexNum: i };
            }
            // Collapse button
            let btnRect = this._getCollapseButtonRect(node);
            if (wx >= btnRect.left && wx <= btnRect.right && wy >= btnRect.top && wy <= btnRect.bottom)
                return { node, hitType: HIT_TYPE_COLLAPSE_BUTTON, indexNum: -1 };
            // Body
            if (wx >= b.left && wx <= b.right && wy >= b.top && wy <= b.bottom)
                return { node, hitType: HIT_TYPE_BODY, indexNum: -1 };
        }
        return null;
    }

    // ---- Rendering ----
    render() {
        let ctx = this.ctx;
        let W = this.canvas.width, H = this.canvas.height;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);

        this._drawGrid();

        // Edges
        for (let edge of tensorNet.edges.values()) this._drawEdge(edge);

        // Edge being dragged
        if (this.mode === MODE_CREATE_EDGE && this.edgeSrcNode) {
            let sc = this.getIdxSquareCenter(this.edgeSrcNode, this.edgeSrcIdx);
            let yOff = INDEX_SQUARE_SIZE * 0.7;
            ctx.strokeStyle = EDGE_DRAG_COLOR;
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            this._strokeBezierEdge(
                this.w2sx(sc.x),  this.w2sy(sc.y + yOff),
                this.w2sx(this.edgeDragEndWX), this.w2sy(this.edgeDragEndWY)
            );
            ctx.setLineDash([]);
        }

        // Nodes
        for (let node of tensorNet.nodes.values()) this._drawNode(node);

        // Draw highlighted edge on top (over nodes)
        for (let edge of tensorNet.edges.values()) {
            let i1 = edge.node1.getIndexOfIndexObjectById(edge.node1_indexId);
            let i2 = edge.node2.getIndexOfIndexObjectById(edge.node2_indexId);
            if (this._highlights.some(h => h.node === edge.node1 && h.idx === i1) &&
                this._highlights.some(h => h.node === edge.node2 && h.idx === i2))
                this._drawEdge(edge, true);
        }

        // Lasso / rect select
        if ((this.mode === MODE_LASSO_SELECT || this.mode === MODE_RECT_SELECT) && this.lassoPointsW.length > 1) {
            ctx.strokeStyle = LASSO_SELECT_COLOR;
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(this.w2sx(this.lassoPointsW[0].x), this.w2sy(this.lassoPointsW[0].y));
            for (let i = 1; i < this.lassoPointsW.length; i++)
                ctx.lineTo(this.w2sx(this.lassoPointsW[i].x), this.w2sy(this.lassoPointsW[i].y));
            if (this.mode === MODE_LASSO_SELECT) ctx.closePath();
            ctx.stroke();
            if (this.mode === MODE_RECT_SELECT) {
                const p0 = this.lassoPointsW[0];
                const p1 = this.lassoPointsW[this.lassoPointsW.length - 1];
                const sx0 = this.w2sx(Math.min(p0.x, p1.x));
                const sy0 = this.w2sy(Math.min(p0.y, p1.y));
                const sx1 = this.w2sx(Math.max(p0.x, p1.x));
                const sy1 = this.w2sy(Math.max(p0.y, p1.y));
                ctx.strokeRect(sx0, sy0, sx1 - sx0, sy1 - sy0);
            }
            ctx.setLineDash([]);
        }

        // Canvas index callout tooltips
        if (this.nodeUnderCursor)
            this._drawIndexCallouts(this.nodeUnderCursor);

        // Node count overlay
        ctx.fillStyle = '#0ff';
        ctx.font = '20px "Courier New", monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        let pluralSuffix = tensorNet.nodes.size===1 ? "" : "s";
        ctx.fillText(`${tensorNet.nodes.size} tensor` + pluralSuffix, 8, 8);
        if (this.isUserInterfaceLocked) {
            ctx.fillText('🔒UI is locked', 8, 8 + 26);
        }

        // Popup context menu (drawn last, on top of everything)
        if (this.popupMenu.isVisible()) this.popupMenu.draw(ctx);
    }

    _drawIndexCallouts(node, theOnlyIndexToDraw = -1) {
        const ctx = this.ctx;
        const g = this.getNodeGeom(node);
        if (g.rank === 0) return;

        const GAP = 3;        // px between index square bottom and level-0 callout tip
        const STAGGER = 20;   // px added per stagger level
        const PAD_H = 6;      // horizontal padding inside callout box
        const PAD_V = 2;      // vertical padding inside callout box
        const NOTCH = 5;      // size of the 45° notch (equal horiz. and vert. span -> true 45°)
        const FONT_SIZE = 12;

        ctx.save();
        ctx.font = `${FONT_SIZE}px 'Courier New', monospace`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        for (let i = 0; i < g.rank; i++) {
            if (theOnlyIndexToDraw >= 0 && i !== theOnlyIndexToDraw) continue;
            let level = g.rank - 1 - i;  // index 0 (leftmost) gets the longest leader
            let c = this.getIdxSquareCenter(node, i);
            let r = this.getIdxSquareRect(node, i);
            let sx = this.w2sx(c.x);
            let bottomSy = this.w2sy(r.bottom);
            let name = node.indices[i].name || '_';
            let textW = ctx.measureText(name).width;
            let isHighlighted = this._highlights.some(h => h.node === node && h.idx === i);
            let color = isHighlighted ? '#f80' : '#0f0';
            let bgColor = '#000';

            // Tip of pointer (where leader line ends); box left edge is at the leader line x
            let tipY = bottomSy + GAP + level * STAGGER;
            let boxTop = tipY + NOTCH;   // box starts NOTCH px below the tip
            let boxH = FONT_SIZE + 2 * PAD_V;
            let boxW = textW + 2 * PAD_H;
            let boxLeft = sx;            // left edge coincides with leader line

            // Leader line from bottom of index square to tip
            ctx.strokeStyle = color;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(sx, bottomSy);
            ctx.lineTo(sx, tipY);
            ctx.stroke();

            // Callout shape: left edge is vertical (leader line extended); top-left has a
            // 45° NW->SE notch edge connecting the tip to (boxLeft+NOTCH, boxTop).
            ctx.fillStyle = bgColor;
            ctx.strokeStyle = color;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(sx, tipY);                             // pointer tip (top of leader)
            ctx.lineTo(boxLeft + NOTCH, boxTop);              // 45° diagonal NW->SE to box top
            ctx.lineTo(boxLeft + boxW, boxTop);               // box top-right
            ctx.lineTo(boxLeft + boxW, boxTop + boxH);        // box bottom-right
            ctx.lineTo(boxLeft, boxTop + boxH);               // box bottom-left
            ctx.closePath();                                   // straight up the left edge back to tip
            ctx.fill();
            ctx.stroke();

            // Label text
            ctx.fillStyle = color;
            ctx.fillText(name, boxLeft + PAD_H, boxTop + PAD_V);
        }

        ctx.restore();
    }

    _drawGrid() {
        let ctx = this.ctx;
        let vb = this.getVisibleBounds();
        let ideal = 50 / this.pixelsPerUnit;
        let mag = Math.pow(10, Math.floor(Math.log10(ideal)));
        let res = ideal / mag;
        let sp = res < 2 ? mag : res < 5 ? 2 * mag : 5 * mag;

        ctx.strokeStyle = '#1a1a1a';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = Math.floor(vb.left / sp) * sp; x <= vb.right; x += sp) {
            let sx = Math.round(this.w2sx(x));
            ctx.moveTo(sx, 0); ctx.lineTo(sx, this.canvas.height);
        }
        for (let y = Math.floor(vb.top / sp) * sp; y <= vb.bottom; y += sp) {
            let sy = Math.round(this.w2sy(y));
            ctx.moveTo(0, sy); ctx.lineTo(this.canvas.width, sy);
        }
        ctx.stroke();
    }

    _drawNode(node) {
        let ctx = this.ctx;
        let g = this.getNodeGeom(node);
        let b = this.getNodeBounds(node);
        const userSel = this.userSelectedNodes.has(node);
        const sysSel  = this.systemSelectedNodes.has(node);
        const sel     = userSel || sysSel;
        const highlightedIdxSet = new Set(
            this._highlights.filter(h => h.node === node).map(h => h.idx)
        );

        let sx = this.w2sx(b.left), sy = this.w2sy(b.top);
        let sw = this.w2sLen(b.w), sh = this.w2sLen(g.textH + NODE_PADDING);

        // Text bounding rect
        ctx.fillStyle  = `rgba(10,10,10,${this.nodeBgOpacity})`;
        ctx.strokeStyle = userSel ? USER_SEL_BORDER_COLOR : (sysSel ? SYS_SEL_BORDER_COLOR : '#0a0');
        ctx.lineWidth  = sel ? SEL_BORDER_LINE_WIDTH : 1;
        ctx.fillRect(sx, sy, sw, sh);
        ctx.strokeRect(sx, sy, sw, sh);

        // Text
        let fontSize = this.w2sLen(CHAR_HEIGHT * FONT_SCALE);
        if (fontSize > 2) {
            ctx.fillStyle = '#0f0';
            ctx.font = `${fontSize}px 'Courier New', monospace`;
            ctx.textBaseline = 'top';
            ctx.textAlign = 'left';
            let tx = this.w2sx(b.left + NODE_PADDING);
            let ty = this.w2sy(b.top) + this.w2sLen(NODE_PADDING * 0.5);
            for (let i = 0; i < g.lines.length; i++) {
                ctx.fillText(g.lines[i], tx, ty + i * this.w2sLen(CHAR_HEIGHT));

                for (let hidx of highlightedIdxSet) {
                    let originalString = g.lines[i];
                    // Figure out which characters to highlight, and draw them again, in a different color

                    let s = ""; // the string containing characters to highlight
                    if ( i === 0 ) { // highlight within the first line, which is the header
                        // Highlight between two separating chars
                        if ( node.indices.length > 1 ) {
                            let indexOfPrecedingSeparator = -1;
                            let indexOfFollowingSeparator = -1;
                            if ( hidx > 0 ) {
                                indexOfPrecedingSeparator = StringUtil.findNthOfAny(originalString, "×", 0, hidx  );
                                if ( hidx === node.indices.length - 1 ) {
                                    indexOfFollowingSeparator = StringUtil.findNthOfAny(originalString, "= ", indexOfPrecedingSeparator+1, 1 );
                                    if ( indexOfFollowingSeparator === -1 )
                                        indexOfFollowingSeparator = originalString.length;
                                }
                            }
                            if ( hidx < node.indices.length - 1 ) {
                                indexOfFollowingSeparator = StringUtil.findNthOfAny(originalString, "×", 0, hidx + 1 );
                                if ( hidx === 0 )
                                    indexOfPrecedingSeparator = StringUtil.findNthOfAny(originalString, ", ", indexOfFollowingSeparator-1, 1, false );
                                        // the result might be -1, which we will consider as valid in this case
                            }
                            let firstCharToHighlight = indexOfPrecedingSeparator + 1;
                            let lastCharToHighlight = indexOfFollowingSeparator - 1;
                            s = " ".repeat( firstCharToHighlight );
                            s += originalString.slice( firstCharToHighlight, indexOfFollowingSeparator );
                        }
                    }
                    else if ( hidx < node.indices.length - 2 ) {
                        let t = StringUtil.findNthOfAny(originalString, ":", 0, 1); // find colon
                        if ( t >= 0 ) {
                            // Highlight between the (hidx + 1)th separating char and the next separating char
                            let indexOfPrecedingSeparator = StringUtil.findNthOfAny(originalString, "[,", 0, hidx + 1 );
                            if ( indexOfPrecedingSeparator >= 0 ) {
                                let firstCharToHighlight = indexOfPrecedingSeparator + 1;
                                let indexOfFollowingSeparator = StringUtil.findNthOfAny(originalString, ",]:", firstCharToHighlight, 1);
                                if ( indexOfFollowingSeparator >= 0 ) {
                                    let lastCharToHighlight = indexOfFollowingSeparator - 1;
                                    s = " ".repeat( firstCharToHighlight );
                                    s += originalString.slice( firstCharToHighlight, indexOfFollowingSeparator );
                                }
                            }
                        }
                    }
                    else if ( hidx === node.indices.length - 2 ) { // highlight the 2nd last index
                        let indexOfLastLeftBracket = StringUtil.findNthOfAny(originalString, "[", originalString.length-1, 1, false);
                        if ( indexOfLastLeftBracket >= 0 ) {
                            let indexOfColon = StringUtil.findNthOfAny(originalString, ":", 0, 1);
                            if ( indexOfColon===-1 || ( indexOfColon < indexOfLastLeftBracket ) ) {
                                // Highlight the last open bracket
                                s = " ".repeat( indexOfLastLeftBracket );
                                s += "[";
                            }
                        }
                    }
                    else { // hightlight the last index
                        let t = StringUtil.findNthOfAny(originalString, ":", 0, 1); // find colon
                            // the result might be -1, which might still be valid, if we have a rank 2 tensor i.e. a matrix
                        if ( t >= 0 || (i===1) ) {
                            t ++;
                            s = " ".repeat(t);
                            let charsToHighlight = new Set("[,]"); // the chars to highlight
                            for ( ; t < originalString.length; ++t ) {
                                if ( charsToHighlight.has( originalString[t] ) ) {
                                    s += originalString[t];
                                }
                                else s += " ";
                            }
                        }
                    }
                    ctx.fillStyle = '#f80';
                    ctx.fillText(s, tx, ty + i * this.w2sLen(CHAR_HEIGHT));
                    ctx.fillStyle = '#0f0';
                }
            }
        }

        // Index squares
        for (let i = 0; i < g.rank; i++) {
            let r = this.getIdxSquareRect(node, i);
            let rsx = this.w2sx(r.left), rsy = this.w2sy(r.top);
            let rsw = this.w2sLen(INDEX_SQUARE_SIZE), rsh = rsw;

            let hasEdge = this._indexHasEdge(node, i);

            let isHighlighted = highlightedIdxSet.has(i);
            ctx.fillStyle = isHighlighted ? '#006060' : (hasEdge ? '#004040' : '#1a1a1a');
            ctx.strokeStyle = isHighlighted ? '#0ff' : (sel ? '#0ff' : '#088');
            ctx.lineWidth = 1;
            ctx.fillRect(rsx, rsy, rsw, rsh);
            ctx.strokeRect(rsx, rsy, rsw, rsh);

            if (fontSize > 4) {
                ctx.fillStyle = '#0ff';
                let idxFontScale = i < 10 ? 1.2 : 0.6; // if index is only 1 digit long, make the font bigger
                ctx.font = `${Math.max(8, fontSize * idxFontScale)}px 'Courier New', monospace`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(i.toString(), rsx + rsw / 2, rsy + rsh / 2);
                ctx.textAlign = 'left';
            }
        }

        if ( highlightedIdxSet.size > 0 && node !== this.nodeUnderCursor ) {
            for (let hidx of highlightedIdxSet)
                this._drawIndexCallouts( node, hidx );
        }

        // Collapse / expand button in top-right corner of node body
        {
            const btnSize = CHAR_HEIGHT;
            const btnWX = b.right - btnSize;
            const btnWY = b.top;
            const bsx = this.w2sx(btnWX), bsy = this.w2sy(btnWY);
            const bsw = this.w2sLen(btnSize), bsh = this.w2sLen(btnSize);
            const btnHovered = this.hoveredCollapseNode === node;
            ctx.fillStyle = btnHovered ? '#2a4a2a' : '#1a2a1a';
            ctx.strokeStyle = btnHovered ? '#0f0' : '#0a0';
            ctx.lineWidth = btnHovered ? 2 : 1;
            ctx.fillRect(bsx, bsy, bsw, bsh);
            ctx.strokeRect(bsx, bsy, bsw, bsh);
            if (bsw > 4) {
                ctx.fillStyle = '#0f0';
                ctx.font = `${Math.max(8, bsw * 0.7)}px 'Courier New', monospace`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(node.isCollapsed ? '+' : '-', bsx + bsw / 2, bsy + bsh / 2);
                ctx.textAlign = 'left';
                ctx.textBaseline = 'top';
            }
        }

        // Selection highlight outer border(s)
        if (sel) {
            ctx.lineWidth = SEL_BORDER_LINE_WIDTH;
            const o1 = SEL_GLOW_OFFSET;
            const o2 = SEL_GLOW_OFFSET + SEL_GLOW_EXTRA_OFFSET;
            // When both sets apply, draw user-sel at the inner offset and sys-sel at the outer offset
            // so both rings are visible simultaneously.
            if (userSel) {
                ctx.strokeStyle = USER_SEL_BORDER_COLOR;
                ctx.strokeRect(this.w2sx(b.left) - o1, this.w2sy(b.top) - o1,
                    this.w2sLen(b.w) + 2*o1, this.w2sLen(b.h) + 2*o1);
            }
            if (sysSel) {
                const o = userSel ? o2 : o1;
                ctx.strokeStyle = SYS_SEL_BORDER_COLOR;
                ctx.strokeRect(this.w2sx(b.left) - o, this.w2sy(b.top) - o,
                    this.w2sLen(b.w) + 2*o, this.w2sLen(b.h) + 2*o);
            }
        }
    }

    // Strokes a bezier curve between two screen-space points using the current
    // tangentLength and curvature settings.  The caller must set strokeStyle,
    // lineWidth, and any dash pattern before calling.
    _strokeBezierEdge(sx1, sy1, sx2, sy2) {
        let tLen = this.w2sLen(this.tangentLength);
        let dx = sx2 - sx1;
        let cv = this.curvature;
        let ctx = this.ctx;
        ctx.beginPath();
        ctx.moveTo(sx1, sy1);
        ctx.bezierCurveTo(sx1 + dx * cv, sy1 + tLen, sx2 - dx * cv, sy2 + tLen, sx2, sy2);
        ctx.stroke();
    }

    _drawEdge(edge, highlighted = false) {
        let ctx = this.ctx;
        let i1 = edge.node1.getIndexOfIndexObjectById(edge.node1_indexId);
        let i2 = edge.node2.getIndexOfIndexObjectById(edge.node2_indexId);
        if (i1 < 0 || i2 < 0) return;

        let p1 = this.getIdxSquareCenter(edge.node1, i1);
        let p2 = this.getIdxSquareCenter(edge.node2, i2);
        // Place endpoints slightly below the bottom edge of the index square
        let yOff = INDEX_SQUARE_SIZE * 0.7; // 0.5 to reach bottom + 0.2 below

        ctx.strokeStyle = highlighted ? '#ff800080' : '#f80';
        ctx.lineWidth = highlighted ? 4 : 2;
        this._strokeBezierEdge(
            this.w2sx(p1.x), this.w2sy(p1.y + yOff),
            this.w2sx(p2.x), this.w2sy(p2.y + yOff)
        );
    }

    // ---- Canvas events ----
    _setupCanvasEvents() {
        this.canvas.addEventListener('mousedown', e => this._onMouseDown(e));
        this.canvas.addEventListener('mousemove', e => this._onMouseMove(e));
        this.canvas.addEventListener('mouseup', e => this._onMouseUp(e));
        this.canvas.addEventListener('wheel', e => this._onWheel(e), { passive: false });
        this.canvas.addEventListener('contextmenu', e => e.preventDefault());
        this.canvas.setAttribute('tabindex', '0');
        this.canvas.addEventListener('mousedown', () => this.canvas.focus());
        window.addEventListener('resize', () => { this._resizeCanvas(); this.render(); });
        this.canvas.addEventListener('keydown', e => {
            if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault();
                if (this.isUserInterfaceLocked) return;
                this._deleteSelected();
                this.tooltipEl.style.display = 'none';
                this._clearHighlights();
                this.nodeUnderCursor = null;
                this.hoveredCollapseNode = null;
                this._updatePanel();
                this.render();
                this._updateURL(true);
            } else if (e.key === 'a' && e.ctrlKey) {
                e.preventDefault();
                for (let node of tensorNet.nodes.values()) this.userSelectedNodes.add(node);
                this._updatePanel();
                this.render();
            } else if (e.key === 'f' && !e.ctrlKey && !e.altKey && !e.metaKey) {
                e.preventDefault();
                this._clearHighlights();
                this.nodeUnderCursor = null;
                this.hoveredCollapseNode = null;
                this._frameAll();
            } else if (e.key === 'c' && !e.ctrlKey && !e.altKey && !e.metaKey) {
                e.preventDefault();
                if (this.isUserInterfaceLocked) return;
                this._clearHighlights();
                this.nodeUnderCursor = null;
                this.hoveredCollapseNode = null;
                this._doContract();
            }
        });
    }

    _canvasPos(e) {
        let r = this.canvas.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    _onMouseDown(e) {
        let p = this._canvasPos(e);

        // If the popup menu is open, route the click through it first.
        if (this.popupMenu.isVisible()) {
            const handled = this.popupMenu.handleMouseDown(p.x, p.y);
            this.render();
            // Swallow all non-right-click events, and right-clicks that were handled.
            if (handled || e.button !== 2) return;
            // A right-click outside the menu closes it and falls through to open a new one.
        }

        let wx = this.s2wx(p.x), wy = this.s2wy(p.y);
        let hit = this.hitTest(wx, wy);

        if (e.button === 2) { // Right click
            if (!this.isUserInterfaceLocked && hit && hit.hitType === HIT_TYPE_INDEX) {
                this._showIndexContextMenu(hit.node, hit.indexNum, p.x, p.y);
            }
            return;
        }
        if (e.button !== 0) return;

        if (e.ctrlKey) {
            if (hit && hit.hitType !== HIT_TYPE_INDEX) {
                if (this.userSelectedNodes.has(hit.node)) this.userSelectedNodes.delete(hit.node);
                else this.userSelectedNodes.add(hit.node);
                this._updatePanel();
                this.render();
            } else if (!hit) {
                this.mode = MODE_RECT_SELECT;
                this.lassoPointsW = [{ x: wx, y: wy }];
                this.lassoTotalDistW = 0;
                this.lassoLastX = wx;
                this.lassoLastY = wy;
            }
            return;
        }

        if (hit) {
            if (hit.hitType === HIT_TYPE_COLLAPSE_BUTTON) {
                let node = hit.node;
                let oldTop = node.y - this.getNodeGeom(node).totalH / 2;
                node.isCollapsed = !node.isCollapsed;
                this.invalidateGeom(node);
                node.y = oldTop + this.getNodeGeom(node).totalH / 2;
                this._updatePanel();
                this.render();
                return;
            }
            if (hit.hitType === HIT_TYPE_INDEX) {
                if (this.isUserInterfaceLocked) return;
                if (this._indexHasEdge(hit.node, hit.indexNum)) return;
                this.mode = MODE_CREATE_EDGE;
                this.edgeSrcNode = hit.node;
                this.edgeSrcIdx = hit.indexNum;
                this.edgeDragEndWX = wx;
                this.edgeDragEndWY = wy;
            } else {
                this.mode = MODE_DRAG_NODE;
                this._dragNodeMoved = false;
                this.draggedNode = hit.node;
                this.dragStartWX = wx;
                this.dragStartWY = wy;
                if (!this.userSelectedNodes.has(hit.node)) {
                    this.userSelectedNodes.clear();
                    this.userSelectedNodes.add(hit.node);
                    this._updatePanel();
                    this.render();
                }
                // Record start positions for all selected nodes
                this.dragStartPositions = new Map();
                for (let n of this.userSelectedNodes)
                    this.dragStartPositions.set(n, { x: n.x, y: n.y });
            }
        } else {
            this.mode = MODE_PAN;
            this.dragStartWX = wx;
            this.dragStartWY = wy;
            this.userSelectedNodes.clear();
            this._updatePanel();
            this.render();
        }
    }

    _clearHighlights() {
        this._highlights = [];
    }

    _indexHasEdge(node, idx) {
        let indexId = node.indices[idx].id;
        for (let e of node.incidentEdges) {
            if (e.node1 === node && e.node1_indexId === indexId) return true;
            if (e.node2 === node && e.node2_indexId === indexId) return true;
        }
        return false;
    }

    _onMouseMove(e) {
        let p = this._canvasPos(e);
        let wx = this.s2wx(p.x), wy = this.s2wy(p.y);

        // Highlight logic
        this._clearHighlights();
        let hit = this.hitTest(wx, wy);
        let needsRender = false;
        if (this.mode === MODE_CREATE_EDGE && this.edgeSrcNode) {
            this._highlights.push({ node: this.edgeSrcNode, idx: this.edgeSrcIdx });
            if (hit && hit.hitType === HIT_TYPE_INDEX && !(hit.node === this.edgeSrcNode && hit.indexNum === this.edgeSrcIdx)) {
                let srcDim = this.edgeSrcNode.indices[this.edgeSrcIdx].dim;
                let dstDim = hit.node.indices[hit.indexNum].dim;
                if (srcDim === dstDim && !this._indexHasEdge(hit.node, hit.indexNum)) {
                    this._highlights.push({ node: hit.node, idx: hit.indexNum });
                }
            }
            // render is already called below in the MODE_CREATE_EDGE switch case
        } else if (this.mode === MODE_NONE) {
            if (hit && hit.hitType === HIT_TYPE_INDEX) {
                this._highlights.push({ node: hit.node, idx: hit.indexNum });
                let indexId = hit.node.indices[hit.indexNum].id;
                for (let e of hit.node.incidentEdges) {
                    let matchesNode1 = (e.node1 === hit.node && e.node1_indexId === indexId);
                    let matchesNode2 = (e.node2 === hit.node && e.node2_indexId === indexId);
                    if (matchesNode1 || matchesNode2) {
                        let other = matchesNode1 ? e.node2 : e.node1;
                        let otherId = matchesNode1 ? e.node2_indexId : e.node1_indexId;
                        this._highlights.push({ node: other, idx: other.getIndexOfIndexObjectById(otherId) });
                        break;
                    }
                }
            }
            needsRender = true;
        }

        // Tooltip
        const newHoveredCollapse = (hit && hit.hitType === HIT_TYPE_COLLAPSE_BUTTON) ? hit.node : null;
        if (newHoveredCollapse !== this.hoveredCollapseNode) {
            this.hoveredCollapseNode = newHoveredCollapse;
            needsRender = true;
        }
        const newHoveredNode = (hit && hit.node && hit.node.indices.length > 0) ? hit.node : null;
        if (newHoveredNode !== this.nodeUnderCursor) {
            this.nodeUnderCursor = newHoveredNode;
            needsRender = true;
        }
        if (needsRender) this.render();

        // Update popup menu hover state
        if (this.popupMenu.isVisible()) {
            if (this.popupMenu.handleMouseMove(p.x, p.y)) this.render();
        }

        if (hit) {
            let node = hit.node;
            // Collapse button tooltip
            if (hit.hitType === HIT_TYPE_COLLAPSE_BUTTON) {
                this.tooltipEl.textContent = node.isCollapsed ? 'Expand' : 'Collapse';
                this.tooltipEl.style.display = 'block';
                this.tooltipEl.style.left = (e.clientX + 12) + 'px';
                this.tooltipEl.style.top = (e.clientY + 12) + 'px';
            } else {
                this.tooltipEl.style.display = 'none';
            }
        } else {
            this.tooltipEl.style.display = 'none';
        }

        switch (this.mode) {
            case MODE_PAN: {
                let dwx = wx - this.dragStartWX, dwy = wy - this.dragStartWY;
                this.viewCenterWX -= dwx;
                this.viewCenterWY -= dwy;
                this.render();
                break;
            }
            case MODE_DRAG_NODE: {
                let dwx = wx - this.dragStartWX, dwy = wy - this.dragStartWY;
                for (let [n, startW] of this.dragStartPositions) {
                    n.x = startW.x + dwx;
                    n.y = startW.y + dwy;
                    n.areCoordinatesInitialized = true;
                }
                this.render();
                this._dragNodeMoved = true;
                break;
            }
            case MODE_CREATE_EDGE:
                this.edgeDragEndWX = wx;
                this.edgeDragEndWY = wy;
                this.render();
                break;
            case MODE_RECT_SELECT: {
                this.lassoPointsW.push({ x: wx, y: wy });
                const segDist = Math.hypot(wx - this.lassoLastX, wy - this.lassoLastY);
                this.lassoTotalDistW += segDist;
                this.lassoLastX = wx;
                this.lassoLastY = wy;
                const startW = this.lassoPointsW[0];
                const straightLineDistW = Math.hypot(wx - startW.x, wy - startW.y);
                if (straightLineDistW > 0 && this.lassoTotalDistW / straightLineDistW > RECT_LASSO_THRESHOLD)
                    this.mode = MODE_LASSO_SELECT;
                this.render();
                break;
            }
            case MODE_LASSO_SELECT:
                this.lassoPointsW.push({ x: wx, y: wy });
                this.render();
                break;
        }
    }

    _onMouseUp(e) {
        let edgeCreated = false;
        if (this.mode === MODE_CREATE_EDGE) {
            let p = this._canvasPos(e);
            let wx = this.s2wx(p.x), wy = this.s2wy(p.y);
            let hit = this.hitTest(wx, wy);
            if (hit && hit.hitType === HIT_TYPE_INDEX && !(hit.node === this.edgeSrcNode && hit.indexNum === this.edgeSrcIdx))
                edgeCreated = this._createEdge(this.edgeSrcNode, this.edgeSrcIdx, hit.node, hit.indexNum);
        }
        if (this.mode === MODE_LASSO_SELECT || this.mode === MODE_RECT_SELECT) this._finishSelection();

        const nodeDragged = this.mode === MODE_DRAG_NODE && this._dragNodeMoved;
        this._clearHighlights();
        this.mode = MODE_NONE;
        this.draggedNode = null;
        this.edgeSrcNode = null;
        this._updatePanel();
        this.render();
        if (edgeCreated || nodeDragged) this._updateURL(true);
    }

    _onWheel(e) {
        e.preventDefault();
        let p = this._canvasPos(e);
        let wxB = this.s2wx(p.x), wyB = this.s2wy(p.y);
        this.pixelsPerUnit *= e.deltaY > 0 ? 0.9 : 1.1;
        this.pixelsPerUnit = Math.max(0.5, Math.min(2000, this.pixelsPerUnit));
        let wxA = this.s2wx(p.x), wyA = this.s2wy(p.y);
        this.viewCenterWX -= (wxA - wxB);
        this.viewCenterWY -= (wyA - wyB);
        this.render();
    }

    // ---- Edge ops ----
    _createEdge(n1, i1, n2, i2) {
        let id1 = n1.indices[i1].id;
        let id2 = n2.indices[i2].id;
        if (n1.indices[i1].dim !== n2.indices[i2].dim) { console.log("Cannot create edge: dimension mismatch"); return false; }
        for (let e of tensorNet.edges.values()) {
            if ((e.node1 === n1 && e.node1_indexId === id1) || (e.node2 === n1 && e.node2_indexId === id1) ||
                (e.node1 === n2 && e.node1_indexId === id2) || (e.node2 === n2 && e.node2_indexId === id2)) {
                console.log("Cannot create edge: index already connected"); return false;
            }
        }
        tensorNet.addEdge(new TensorEdge(n1, id1, n2, id2));
        return true;
    }

    _deleteEdgeAtIdx(node, idx) {
        let indexId = node.indices[idx].id;
        let toRemove = [];
        for (let e of tensorNet.edges.values()) {
            if ((e.node1 === node && e.node1_indexId === indexId) || (e.node2 === node && e.node2_indexId === indexId))
                toRemove.push(e);
        }
        for (let e of toRemove) {
            e.node1.removeIncidentEdge(e);
            e.node2.removeIncidentEdge(e);
            tensorNet.edges.delete(e.id);
        }
    }

    _removeAllIncidentEdgesOnNode(node) {
        let toRemove = [...node.incidentEdges];
        for (let e of toRemove) {
            e.node1.removeIncidentEdge(e);
            e.node2.removeIncidentEdge(e);
            tensorNet.edges.delete(e.id);
        }
    }

    // ---- Lasso ----
    _finishSelection() {
        this.userSelectedNodes.clear();
        if (this.mode === MODE_RECT_SELECT) {
            if (this.lassoPointsW.length >= 2) {
                const p0 = this.lassoPointsW[0], p1 = this.lassoPointsW[this.lassoPointsW.length - 1];
                const xMin = Math.min(p0.x, p1.x), xMax = Math.max(p0.x, p1.x);
                const yMin = Math.min(p0.y, p1.y), yMax = Math.max(p0.y, p1.y);
                for (let node of tensorNet.nodes.values()) {
                    if (node.x >= xMin && node.x <= xMax && node.y >= yMin && node.y <= yMax)
                        this.userSelectedNodes.add(node);
                }
            }
        } else {
            if (this.lassoPointsW.length >= 3) {
                for (let node of tensorNet.nodes.values()) {
                    if (GeomUtil.isPointInPolygon(node.x, node.y, this.lassoPointsW))
                        this.userSelectedNodes.add(node);
                }
            }
        }
        this.lassoPointsW = [];
        this._updatePanel();
    }

    // ---- Panel events ----
    _setupPanelEvents() {
        let createInp = document.getElementById('createTensorInput');
        let btnCreate = document.getElementById('btnCreateTensor');
        createInp.addEventListener('input', () => { btnCreate.disabled = !this._validateCreate(createInp.value); });
        btnCreate.addEventListener('click', () => {
            if (this.isUserInterfaceLocked) return;
            this._doCreate(createInp.value);
        });

        document.getElementById('btnImportCircuit').addEventListener('click', () => {
            if (this.isUserInterfaceLocked) return;
            this._doImportCircuit(document.getElementById('importCircuitURL').value);
        });


        document.getElementById('btnContract').addEventListener('click', () => {
            if (this.isUserInterfaceLocked) return;
            this._doContract();
        });
        document.getElementById('btnClearCost').addEventListener('click', () => this._doClearCost());


        document.getElementById('btnCopySelected').addEventListener('click', () => {
            if (this.isUserInterfaceLocked) return;
            this._doCopySelected();
        });

        document.getElementById('transposeInput').addEventListener('input', () => this._updatePanel());
        document.getElementById('btnTranspose').addEventListener('click', () => {
            if (this.isUserInterfaceLocked) return;
            this._doTranspose(document.getElementById('transposeInput').value);
        });

        document.getElementById('reshapeInput').addEventListener('input', () => this._updatePanel());
        document.getElementById('btnReshape').addEventListener('click', () => {
            if (this.isUserInterfaceLocked) return;
            this._doReshape(document.getElementById('reshapeInput').value);
        });

        document.getElementById('btnDeleteSelected').addEventListener('click', () => {
            if (this.isUserInterfaceLocked) return;
            this._deleteSelected();
        });
        document.getElementById('btnDeleteAll').addEventListener('click', () => {
            if (this.isUserInterfaceLocked) return;
            this._deleteAll();
        });

        document.getElementById('btnFrameAll').addEventListener('click', () => this._frameAll());

        let chkShowIDs = document.getElementById('chkShowNodeIDs');
        chkShowIDs.addEventListener('change', () => { this.showNodeIDs = chkShowIDs.checked; this.render(); });

        let chkSuppressZeros = document.getElementById('chkSuppressZeros');
        chkSuppressZeros.addEventListener('change', () => { this.suppressZeros = chkSuppressZeros.checked; this.render(); });

        let nodeBgOpacitySlider = document.getElementById('nodeBgOpacitySlider');
        nodeBgOpacitySlider.value = DEFAULT_NODE_BG_OPACITY;
        document.getElementById('nodeBgOpacityVal').textContent = DEFAULT_NODE_BG_OPACITY.toFixed(2);
        nodeBgOpacitySlider.addEventListener('input', () => {
            this.nodeBgOpacity = parseFloat(nodeBgOpacitySlider.value);
            document.getElementById('nodeBgOpacityVal').textContent = this.nodeBgOpacity.toFixed(2);
            this.render();
        });

        let tSlider = document.getElementById('tangentLenSlider');
        tSlider.addEventListener('input', () => {
            this.tangentLength = parseFloat(tSlider.value);
            document.getElementById('tangentLenVal').textContent = this.tangentLength.toFixed(1);
            this.render();
        });
        let cSlider = document.getElementById('curvatureSlider');
        cSlider.addEventListener('input', () => {
            this.curvature = parseFloat(cSlider.value);
            document.getElementById('curvatureVal').textContent = this.curvature.toFixed(2);
            this.render();
        });

        // Step-by-step procedure
        const pairProc = new PairContractionProcedure(this);
        pairProc.bindToPanel({
            startBtnId:    'btnSbsStart',
            nextBtnId:     'btnSbsNext',
            stopBtnId:     'btnSbsStop',
            statusLabelId: 'sbsStatus',
            stepListId:    'sbsStepList',
        });
        pairProc.bindPolicyDropdown('sbsPolicy');
    }

    _setupResizeHandle() {
        let handle = document.getElementById('resize-handle');
        let panel = document.getElementById('panel');
        let dragging = false;
        handle.addEventListener('mousedown', e => { dragging = true; e.preventDefault(); });
        document.addEventListener('mousemove', e => {
            if (!dragging) return;
            let w = Math.max(200, Math.min(600, e.clientX));
            panel.style.width = w + 'px';
            this._resizeCanvas();
            this.render();
        });
        document.addEventListener('mouseup', () => { dragging = false; });
    }

    _updatePanel() {
        const COST_LABEL = 'Cost of selected:';

        // When locked, disable all mutation buttons and return early.
        if (this.isUserInterfaceLocked) {
            document.getElementById('btnCreateTensor').disabled = true;
            document.getElementById('btnImportCircuit').disabled = true;
            document.getElementById('btnContract').disabled = true;
            document.getElementById('btnCopySelected').disabled = true;
            document.getElementById('btnTranspose').disabled = true;
            document.getElementById('btnReshape').disabled = true;
            document.getElementById('btnDeleteSelected').disabled = true;
            document.getElementById('btnDeleteAll').disabled = true;
            document.getElementById('costDisplay').textContent = COST_LABEL;
            return;
        }

        // Re-enable buttons whose enabled state isn't managed by the selection logic below.
        document.getElementById('btnCreateTensor').disabled =
            !this._validateCreate(document.getElementById('createTensorInput').value);
        document.getElementById('btnImportCircuit').disabled = false;
        document.getElementById('btnDeleteAll').disabled = false;

        let sel = Array.from(this.userSelectedNodes);
        let n = sel.length;

        // Contract
        let btnC = document.getElementById('btnContract');
        let costD = document.getElementById('costDisplay');
        if (n === 0) {
            btnC.disabled = true;
            costD.textContent = COST_LABEL;
        } else if (n === 1) {
            const hasSelfEdge = sel[0].neighboringNodes.has(sel[0]);
            btnC.disabled = !hasSelfEdge;
            costD.textContent = hasSelfEdge ? COST_LABEL+' '+ tensorNet.computeContractionCost(sel[0], sel[0]) : 'Cost:';
        } else if (n === 2) {
            btnC.disabled = false;
            costD.textContent = COST_LABEL+' ' + tensorNet.computeContractionCost(sel[0], sel[1]);
        } else {
            // n >= 3: always enable; cost is order-dependent so not shown upfront
            btnC.disabled = false;
            costD.textContent = COST_LABEL;
        }

        // Copy selected
        document.getElementById('btnCopySelected').disabled = n === 0;

        // Transpose
        let btnT = document.getElementById('btnTranspose');
        if (n === 1) { btnT.disabled = !this._validateTranspose(document.getElementById('transposeInput').value, sel[0]); }
        else { btnT.disabled = true; }

        // Reshape
        let btnR = document.getElementById('btnReshape');
        if (n === 1) { btnR.disabled = !this._validateReshape(document.getElementById('reshapeInput').value, sel[0]); }
        else { btnR.disabled = true; }

        // Delete selected
        document.getElementById('btnDeleteSelected').disabled = n === 0;
    }

    // ---- Validation ----

    // Splits a user-entered create string into an array of individual definition strings
    // (each a naked nested array or a tuple), skipping whitespace/comma/semicolon separators.
    // Returns the array of raw definition strings, or null if the input is structurally malformed.
    _splitCreateInput(str) {
        str = str.trim();
        if (!str) return null;
        const defs = [];
        let i = 0;
        while (i < str.length) {
            while (i < str.length && /[\s,;]/.test(str[i])) i++;
            if (i >= str.length) break;
            const start = i;
            if (str[i] === '[') {
                // Naked nested array: advance past the balanced '[...]'
                let depth = 0;
                while (i < str.length) {
                    if      (str[i] === '[') depth++;
                    else if (str[i] === ']') { depth--; if (depth === 0) { i++; break; } }
                    i++;
                }
                if (depth !== 0) return null; // unbalanced brackets
            } else if (str[i] === '(') {
                // Tuple: advance past the balanced '(...)', respecting quoted strings inside
                let depth = 1; i++;
                while (i < str.length && depth > 0) {
                    const c = str[i];
                    if (c === '"' || c === "'") {
                        const q = c; i++;
                        while (i < str.length && str[i] !== q) {
                            if (str[i] === '\\') i++; // skip escape
                            i++;
                        }
                        if (i < str.length) i++; // skip closing quote
                    } else if (c === '(') { depth++; i++; }
                    else if (c === ')') { depth--; i++; }
                    else i++;
                }
                if (depth !== 0) return null; // unbalanced parens
            } else {
                return null; // unexpected character
            }
            defs.push(str.slice(start, i));
        }
        return defs.length > 0 ? defs : null;
    }

    _validateCreate(str) {
        const defs = this._splitCreateInput(str);
        return defs !== null && defs.every(d => TensorNode.isValidUserString(d));
    }

    _validateTranspose(str, node) {
        try {
            let arr = JSON.parse(str);
            if (!Array.isArray(arr)) return false;
            let R = node.tensor.getRank();
            if (arr.length !== R) return false;
            let seen = new Set();
            for (let v of arr) { if (!Number.isInteger(v) || v < 0 || v >= R || seen.has(v)) return false; seen.add(v); }
            return true;
        } catch (e) { return false; }
    }

    _validateReshape(str, node) {
        try {
            let arr = JSON.parse(str);
            if (!Array.isArray(arr)) return false;
            let prod = 1;
            for (let v of arr) { if (!Number.isInteger(v) || v <= 0) return false; prod *= v; }
            return prod === node.tensor.getSize();
        } catch (e) { return false; }
    }

    // ---- Panel actions ----
    _doCreate(str) {
        const defs = this._splitCreateInput(str);
        if (!defs) return;
        let vb = this.getVisibleBounds();
        let sx = vb.left + 5, sy = vb.top + 5, yOff = 0;
        for (let def of defs) {
            let nd = TensorNode.fromUserString(def);
            nd.x = sx;
            nd.y = sy + yOff;
            nd.areCoordinatesInitialized = true;
            tensorNet.addNode(nd);
            let g = this.getNodeGeom(nd);
            yOff += g.totalH + 2;
        }
        this._frameAll();
        this._updateURL(true);
    }

    _doImportCircuit(urlStr) {
        urlStr = urlStr.trim();
        if (!urlStr) return;

        // Extract the JSON after "circuit="
        const markerIdx = urlStr.indexOf('circuit=');
        let circuitStr = markerIdx !== -1 ? urlStr.slice(markerIdx + 'circuit='.length) : urlStr;

        // URL-decode %xx sequences
        // circuitStr = circuitStr.replace(/%([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
        circuitStr = decodeURIComponent( circuitStr );

        // Build circuit from JSON string
        let circuit;
        try {
            circuit = new Circuit();
            circuit.constructFromString(circuitStr);
        } catch (e) {
            console.error('Failed to parse circuit:', e);
            alert('Failed to parse circuit: ' + e.message);
            return;
        }

        // Snapshot existing node IDs so we can identify the newly added ones afterward.
        const existingNodeIds = new Set(tensorNet.nodes.keys());

        // Add nodes and edges directly into tensorNet.
        convertCircuitToTensorNet(circuit, tensorNet);

        // Assign positions to newly added nodes, laying them out in a grid
        const xSpacing = 12, ySpacing = 10;
        for (let [id, node] of tensorNet.nodes) {
            if (existingNodeIds.has(id)) continue;
            node.x = ( node.x + /*stagger*/ 0.8*(node.y-1)/circuit.numWires ) * xSpacing;
            node.y *= ySpacing;
            node.areCoordinatesInitialized = true;
        }

        this._frameAll();
        this._updateURL(true);
    }

    _doContract() {
        let new_x, new_y;
        let cost;
        let newest;
        const n = this.userSelectedNodes.size;
        if (n === 1) {
            let [node] = Array.from(this.userSelectedNodes);
            new_x = node.x;
            new_y = node.y;
            cost = tensorNet.computeContractionCost(node, node);
            this.invalidateGeom( node );
            newest = tensorNet.performUnaryContraction(node);
        } else if (n === 2) {
            let [n1, n2] = Array.from(this.userSelectedNodes);
            new_x = (n1.x + n2.x) / 2;
            new_y = (n1.y + n2.y) / 2;
            cost = tensorNet.computeContractionCost(n1, n2);
            this.invalidateGeom( n1 );
            this.invalidateGeom( n2 );
            newest = tensorNet.performSmartBinaryContraction(n1, n2);
        } else if (n >= 3) {
            if (n >= NARY_CONTRACTION_WARNING_THRESHOLD && !this._largeContractionConfirmed) {
                const ok = window.confirm(
                    `You are about to contract ${n} nodes at once.\n` +
                    `This may be computationally expensive.\n\n` +
                    `Proceed? (This dialog will not appear again this session.)`
                );
                if (!ok) return;
                this._largeContractionConfirmed = true;
            }
            const nodeArray = Array.from(this.userSelectedNodes);
            const centroid = Vec2.centroid(nodeArray);
            new_x = centroid.x;
            new_y = centroid.y;
            for (const node of nodeArray) this.invalidateGeom(node);
            const [totalCost, remainingSet] = tensorNet.performNaryContraction(
                this.userSelectedNodes, /*contractDisconnectedNodes=*/true
            );
            cost = totalCost;
            newest = remainingSet.size === 1 ? Array.from(remainingSet)[0] : null;
        } else {
            return;
        }
        if ( newest ) {
            this.userSelectedNodes.clear();
            newest.x = new_x;
            newest.y = new_y;
            newest.areCoordinatesInitialized = true;
            this.userSelectedNodes.add(newest);

            this.cumulativeCost += cost;
            document.getElementById('cumulativeCostDisplay').textContent = 'Cumulative cost: ' + this.cumulativeCost;
        }
        this._updatePanel();
        this.render();
        this._updateURL(true);
    }

    _doTranspose(str) {
        if (this.userSelectedNodes.size !== 1) return;
        let node = Array.from(this.userSelectedNodes)[0];
        let perm = JSON.parse(str);
        node.transpose(perm);
        this.invalidateGeom(node);
        this._updatePanel();
        this.render();
        this._updateURL(true);
    }

    _doReshape(str) {
        if (this.userSelectedNodes.size !== 1) return;
        let node = Array.from(this.userSelectedNodes)[0];
        let ns = JSON.parse(str);
        this._removeAllIncidentEdgesOnNode(node);
        let newNames = this._computeReshapeIndexNames(node.indices, ns);
        node.tensor.reshape(ns);
        node.indices = [];
        for (let i = 0; i < ns.length; i++)
            node.indices.push({ name: newNames[i], dim: ns[i], indexType: TensorNode.IT_INPUT });
        tensorNet.assignIndexIds(node);
        this.invalidateGeom(node);
        this._updatePanel();
        this.render();
        this._updateURL(true);
    }

    // Compute new index names for a reshape operation, treating each index name as
    // a comma-separated list of atomic sub-names. Merging indices joins their atoms
    // with commas; splitting an index distributes its atoms using a log-proportion
    // heuristic (more atoms go to larger dimensions). Falls back to 'idx{i}' when
    // a split is unresolvable (e.g. a single atom that must be split).
    _computeReshapeIndexNames(oldIndices, newShape) {
        // Build a queue of chunks: { atoms: string[], dim: number }
        let queue = oldIndices.map(idx => ({ atoms: idx.name.split(MERGED_INDEX_NAME_DELIMITER), dim: idx.dim }));

        let newNames = [];
        for (let i = 0; i < newShape.length; i++) {
            let targetDim = newShape[i];
            let accDim = 1;
            let accAtoms = [];

            while (accDim < targetDim && queue.length > 0) {
                let chunk = queue[0];
                let product = accDim * chunk.dim;

                if (product <= targetDim) {
                    // Whole chunk fits within the target (exactly or still room for more)
                    queue.shift();
                    accAtoms.push(...chunk.atoms);
                    accDim = product;
                } else {
                    // Chunk is too large; split off exactly what is needed
                    let neededDim = targetDim / accDim;
                    let rightDim = chunk.dim / neededDim;
                    if (Number.isInteger(neededDim) && Number.isInteger(rightDim)) {
                        let { left, right } = this._splitAtomsByLogProportion(chunk.atoms, chunk.dim, neededDim);
                        queue.shift();
                        queue.unshift({ atoms: right, dim: rightDim });
                        accAtoms.push(...left);
                    } else {
                        // Dims don't divide cleanly - shouldn't happen with a valid reshape
                        queue.shift();
                        accAtoms.push(...chunk.atoms);
                    }
                    accDim = targetDim;
                }
            }

            newNames.push(accAtoms.length > 0 ? accAtoms.join(MERGED_INDEX_NAME_DELIMITER) : `idx${i}`);
        }
        return newNames;
    }

    // Split atoms into a left group (whose implied dimension = leftDim) and a right group
    // (dimension = totalDim / leftDim). Uses a log-proportion heuristic: the fraction of
    // atoms assigned to the left ≈ log(leftDim) / log(totalDim). Guarantees at least one
    // atom on the left; if there is only one atom it all goes left and right is empty.
    _splitAtomsByLogProportion(atoms, totalDim, leftDim) {
        if (atoms.length <= 1) return { left: atoms, right: [] };
        let logFraction = Math.log(leftDim) / Math.log(totalDim);
        let splitPos = Math.max(1, Math.min(atoms.length - 1, Math.round(logFraction * atoms.length)));
        return { left: atoms.slice(0, splitPos), right: atoms.slice(splitPos) };
    }







    // Reshape a specific node to newShape. Mirrors _doReshape but takes a node directly
    // instead of pulling it from the selection.
    _doReshapeForNode(node, newShape) {
        this._removeAllIncidentEdgesOnNode(node);
        const newNames = this._computeReshapeIndexNames(node.indices, newShape);
        node.tensor.reshape(newShape);
        node.indices = [];
        for (let i = 0; i < newShape.length; i++)
            node.indices.push({ name: newNames[i], dim: newShape[i], indexType: TensorNode.IT_INPUT });
        tensorNet.assignIndexIds(node);
        this.invalidateGeom(node);
        this._updatePanel();
        this.render();
        this._updateURL(true);
    }

    // Show the canvas-drawn index context menu at screen position (sx, sy).
    _showIndexContextMenu(node, idxNum, sx, sy) {
        const rank  = node.tensor.getRank();
        const shape = node.tensor.getShape();
        const dim   = shape[idxNum]; // dimension of this index
        const hasEdge = this._indexHasEdge(node, idxNum);

        const squareSize_s = this.w2sLen( INDEX_SQUARE_SIZE );
        const indexSquareCenter_s = this.getIdxSquareCenter(node, idxNum);
        const arrowStart_x_s = this.w2sx( indexSquareCenter_s.x );
        const arrowStart_y_s = this.w2sy( indexSquareCenter_s.y - INDEX_SQUARE_SIZE / 2 );

        const isLeftMostIndex = ( idxNum === 0 );
        const isRightMostIndex = ( idxNum === rank-1 );

        // Determine how the Split action will behave.
        const dimIsPrime = MathUtil.isPrime( dim );
        const indexName = node.indices[idxNum].name;
        const numDelimiters = indexName.split(MERGED_INDEX_NAME_DELIMITER).length - 1;
        const dimPrimeFactors = dimIsPrime ? [] : MathUtil.primeFactors( dim );
        const numPrimeFactors = dimPrimeFactors.length;
        // Smart split: use the name's delimited atoms as a guide when their count matches
        // the number of prime factors (e.g. name "a,b,c" with dim 8 -> three 2-dim indices).
        const useSmartSplit = !dimIsPrime && numDelimiters >= 1 && numDelimiters + 1 === numPrimeFactors;
        // Fallback: split into the two closest factors (only needed when not using smart split).
        let splitFactor = 0;
        if (!dimIsPrime && !useSmartSplit) {
            splitFactor = Math.floor(Math.sqrt( dim ));
            while (splitFactor > 1 && dim % splitFactor !== 0) splitFactor--;
        }
        const splitTooltip = dimIsPrime
            ? `Cannot split: dimension ${dim} is prime`
            : useSmartSplit
                ? `Split dimension ${dim} into ${dimPrimeFactors.join('×')}`
                : `Split dimension ${dim} into ${splitFactor}×${dim / splitFactor}`;

        const items = [
            {
                label: 'Transpose left',
                disabled: idxNum === 0,
                action: () => {
                    const perm = Array.from({ length: rank }, (_, i) => i);
                    [perm[idxNum - 1], perm[idxNum]] = [perm[idxNum], perm[idxNum - 1]]; // swap
                    node.transpose(perm);
                    this.invalidateGeom(node);
                    this._updatePanel(); this.render(); this._updateURL(true);
                },
                arrowData: !isLeftMostIndex
                    ? {
                        fromSX: arrowStart_x_s, fromSY: arrowStart_y_s,
                        toSX: arrowStart_x_s-squareSize_s*1.5, toSY: arrowStart_y_s
                    }
                    : null,
                tooltip: !isLeftMostIndex
                    ? `Swap index ${idxNum} with index ${idxNum - 1}`
                    : 'Already the leftmost index',
            },
            {
                label: 'Transpose right',
                disabled: idxNum === rank - 1,
                action: () => {
                    const perm = Array.from({ length: rank }, (_, i) => i);
                    [perm[idxNum], perm[idxNum + 1]] = [perm[idxNum + 1], perm[idxNum]]; // swap
                    node.transpose(perm);
                    this.invalidateGeom(node);
                    this._updatePanel(); this.render(); this._updateURL(true);
                },
                arrowData: !isRightMostIndex
                    ? {
                        fromSX: arrowStart_x_s, fromSY: arrowStart_y_s,
                        toSX: arrowStart_x_s+squareSize_s*1.5, toSY: arrowStart_y_s
                    }
                    : null,
                tooltip: !isRightMostIndex
                    ? `Swap index ${idxNum} with index ${idxNum + 1}`
                    : 'Already the rightmost index',
            },
            {
                label: 'Merge left',
                disabled: idxNum === 0,
                action: () => {
                    const newShape = [...shape.slice(0, idxNum - 1), shape[idxNum - 1] * shape[idxNum], ...shape.slice(idxNum + 1)];
                    this._doReshapeForNode(node, newShape);
                },
                arrowData: !isLeftMostIndex
                    ? {
                        fromSX: arrowStart_x_s, fromSY: arrowStart_y_s,
                        toSX: arrowStart_x_s-squareSize_s, toSY: arrowStart_y_s
                    }
                    : null,
                tooltip: !isLeftMostIndex
                    ? `Fuse indices ${idxNum - 1} and ${idxNum}: ${shape[idxNum - 1]}×${shape[idxNum]} -> ${shape[idxNum - 1] * shape[idxNum]}`
                    : 'Already the leftmost index',
            },
            {
                label: 'Merge right',
                disabled: idxNum === rank - 1,
                action: () => {
                    const newShape = [...shape.slice(0, idxNum), shape[idxNum] * shape[idxNum + 1], ...shape.slice(idxNum + 2)];
                    this._doReshapeForNode(node, newShape);
                },
                arrowData: !isRightMostIndex
                    ? {
                        fromSX: arrowStart_x_s, fromSY: arrowStart_y_s,
                        toSX: arrowStart_x_s+squareSize_s, toSY: arrowStart_y_s
                    }
                    : null,
                tooltip: !isRightMostIndex
                    ? `Fuse indices ${idxNum} and ${idxNum + 1}: ${shape[idxNum]}×${shape[idxNum + 1]} -> ${shape[idxNum] * shape[idxNum + 1]}`
                    : 'Already the rightmost index',
            },
            {
                label: 'Split',
                disabled: dimIsPrime,
                action: () => {
                    const newShape = useSmartSplit
                        ? [...shape.slice(0, idxNum), ...dimPrimeFactors, ...shape.slice(idxNum + 1)]
                        : [...shape.slice(0, idxNum), splitFactor, dim / splitFactor, ...shape.slice(idxNum + 1)];
                    this._doReshapeForNode(node, newShape);
                },
                arrowData: null,
                tooltip: splitTooltip,
            },
            {
                label: 'Remove edge',
                disabled: !hasEdge,
                action: () => {
                    this._deleteEdgeAtIdx(node, idxNum);
                    this._updatePanel(); this.render(); this._updateURL(true);
                },
                arrowData: null,
                tooltip: hasEdge ? 'Delete the edge connected to this index' : 'No edge to remove',
            },
        ];

        this.popupMenu.show(sx, sy, items);
        this.render();
    }










    _doClearCost() {
        this.cumulativeCost = 0;
        document.getElementById('cumulativeCostDisplay').textContent = 'Cumulative cost: 0';
    }

    _deleteSelected() {
        for (let nd of this.userSelectedNodes) {
            this._removeAllIncidentEdgesOnNode( nd );
            this.invalidateGeom( nd );
            tensorNet.nodes.delete( nd.id );
        }
        this.userSelectedNodes.clear();
        if (tensorNet.nodes.size === 0) this._doClearCost();
        this._updatePanel();
        this.render();
        this._updateURL(true);
    }

    _doCopySelected() {
        const newNodes = tensorNet.copySubsetOfNodes(this.userSelectedNodes, true, false, 3, 3);
        this.userSelectedNodes.clear();
        for (const node of newNodes) this.userSelectedNodes.add(node);
        this._updatePanel();
        this.render();
        this._updateURL(true);
    }

    _deleteAll() {
        tensorNet.reset();
        this._clearHighlights();
        this.userSelectedNodes.clear();
        this.geomCache.clear();
        this._doClearCost();
        this._updatePanel();
        this.render();
        this._updateURL(true);
    }

    _frameAll() {
        if (tensorNet.nodes.size === 0) {
            this.viewCenterWX = 0; this.viewCenterWY = 0;
            this.pixelsPerUnit = Math.min(this.canvas.width, this.canvas.height) / 40;
            this.render();
            return;
        }
        let bounds = new Box2();
        for (let nd of tensorNet.nodes.values()) {
            let b = this.getNodeBounds(nd);
            bounds.boundPoint(new Vec2(b.left, b.top));
            bounds.boundPoint(new Vec2(b.right, b.bottom));
        }
        let m = 5;
        this.viewCenterWX = bounds.center().x;
        this.viewCenterWY = bounds.center().y;
        this.pixelsPerUnit = Math.min(this.canvas.width / (bounds.width() + 2 * m), this.canvas.height / (bounds.height() + 2 * m));
        this.render();
    }

    // ---- URL state ----
    static _MAX_URL_LENGTH = 8000;

    _encodeNetState() {
        if (tensorNet.nodes.size === 0) return '';
        return encodeURIComponent(tensorNet.toJSONString())
            .replace(/%22/g, '"')
            .replace(/%7B/g, '{')
            .replace(/%7D/g, '}')
            .replace(/%5B/g, '[')
            .replace(/%5D/g, ']')
            .replace(/%3A/g, ':')
            .replace(/%2C/g, ',');
    }

    _updateURL(push) {
        const encoded = this._encodeNetState();
        const hash = encoded ? '#' + encoded : '';
        const url = window.location.pathname + window.location.search + hash;
        if (url.length > TensorNetGUI._MAX_URL_LENGTH) {
            window.history.replaceState(null, '', window.location.pathname + window.location.search);
            return;
        }
        if (push) {
            window.history.pushState(null, '', url);
        } else {
            window.history.replaceState(null, '', url);
        }
    }

    _loadFromURL() {
        const hash = window.location.hash.slice(1);
        this._clearHighlights();
        this.userSelectedNodes.clear();
        this.geomCache.clear();
        if (hash) {
            try {
                window.tensorNet = TensorNet.fromJSONString(decodeURIComponent(hash));
            } catch (e) {
                console.warn('Failed to parse network from URL hash:', e);
            }
        } else {
            tensorNet.reset();
            this._doClearCost();
        }
        this._updatePanel();
        this._frameAll();
    }
}

