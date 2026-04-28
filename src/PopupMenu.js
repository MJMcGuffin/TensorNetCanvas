// Central angle (radians) of the preview arc drawn when hovering Transpose/Merge items.
// π = semicircle; smaller values = flatter arc; larger values = tighter curve.
const ARC_ANGLE = Math.PI * 1.0;

// Delay (ms) before a tooltip appears on first hover. Once any tooltip has been shown
// the menu enters "tooltip mode" and subsequent tooltips appear immediately.
const TOOLTIP_DELAY_MS = 300;

// Menu appearance constants
const FONT_SIZE = 13;    // px
const ITEM_H    = 22;    // px, height of each menu item row
const ITEM_W    = 140;   // px, width of the menu
const PADDING   =  2;    // px, inner padding around items
const FONT      = `${FONT_SIZE}px "Courier New", monospace`;
const COLOR_BG          = 'rgba(0,0,0,0.8)';
const COLOR_BORDER      = '#0a0';
const COLOR_TEXT        = '#0f0';
const COLOR_DISABLED    = '#999';
const COLOR_HIGHLIGHT_FG = '#000';
const COLOR_HIGHLIGHT_BG = '#0f0';
const COLOR_ARROW       = '#f80';   // orange
const ARROW_HEAD_SIZE   = 11;       // px, length of arrowhead triangle

// Tooltip appearance constants
const TOOLTIP_GAP       = 8;        // px gap between menu right edge and tooltip box
const TOOLTIP_PAD_H     = 6;        // px horizontal padding inside tooltip
const TOOLTIP_PAD_V     = 3;        // px vertical padding inside tooltip


export class PopupMenu {
    // onRedrawNeeded: optional zero-argument callback invoked when the menu needs
    // a repaint that it cannot trigger itself (e.g. when a tooltip timer fires).
    constructor(onRedrawNeeded = null) {
        this._onRedrawNeeded = onRedrawNeeded;

        this.visible    = false;
        this.sx         = 0;    // screen x of top-left corner
        this.sy         = 0;    // screen y of top-left corner
        this.items      = [];   // [{label, disabled, action, arrowData, tooltip}]
        this.hoveredIdx = -1;

        // Tooltip state
        this._tooltipTimer   = null;    // pending setTimeout handle
        this._tooltipMode    = false;   // true once the first tooltip has been shown
        this._tooltipVisible = false;
        this._tooltipItemIdx = -1;      // index of item whose tooltip is displayed
    }

    // Show the menu at screen position (sx, sy) with the given items.
    // Each item: {
    //   label:     string,
    //   disabled:  bool,
    //   action:    () => void,
    //   arrowData: { fromSX, fromSY, toSX, toSY } | null,
    //   tooltip:   string | null,
    // }
    show(sx, sy, items) {
        this.visible    = true;
        this.sx         = sx;
        this.sy         = sy;
        this.items      = items;
        this.hoveredIdx = -1;
        this._resetTooltipState();
    }

    hide() {
        this.visible = false;
        this._resetTooltipState();
    }

    isVisible() {
        return this.visible;
    }

    // ---- Internal helpers ----

    _resetTooltipState() {
        if (this._tooltipTimer !== null) {
            clearTimeout(this._tooltipTimer);
            this._tooltipTimer = null;
        }
        this._tooltipMode    = false;
        this._tooltipVisible = false;
        this._tooltipItemIdx = -1;
    }

    // Returns the bounding rect {x, y, w, h} for item i (screen pixels).
    _getItemRect(i) {
        return {
            x: this.sx + PADDING,
            y: this.sy + PADDING + i * ITEM_H,
            w: ITEM_W - PADDING * 2,
            h: ITEM_H,
        };
    }

    // ---- Hit testing ----

    // Returns item index (0-based) when (sx,sy) is over an item row.
    // Returns -2 when inside the menu background but not over any item.
    // Returns -1 when outside the menu entirely.
    hitTest(sx, sy) {
        const menuH = PADDING * 2 + this.items.length * ITEM_H;
        if (sx < this.sx || sx > this.sx + ITEM_W || sy < this.sy || sy > this.sy + menuH)
            return -1;
        for (let i = 0; i < this.items.length; i++) {
            const r = this._getItemRect(i);
            if (sy >= r.y && sy < r.y + r.h) return i;
        }
        return -2;
    }

    // ---- Input handlers ----

    // Update hover state. Returns true if anything changed and a repaint is needed.
    handleMouseMove(sx, sy) {
        const hit    = this.hitTest(sx, sy);
        const newIdx = hit >= 0 ? hit : -1;
        if (newIdx === this.hoveredIdx) return false;

        this.hoveredIdx = newIdx;

        // Cancel any pending tooltip timer.
        if (this._tooltipTimer !== null) {
            clearTimeout(this._tooltipTimer);
            this._tooltipTimer = null;
        }

        const prevTooltipVisible = this._tooltipVisible;
        this._tooltipVisible = false;
        this._tooltipItemIdx = -1;

        const item = newIdx >= 0 ? this.items[newIdx] : null;
        if (item && item.tooltip) {
            if (this._tooltipMode) {
                // Already in tooltip mode - show immediately.
                this._tooltipVisible = true;
                this._tooltipItemIdx = newIdx;
            } else {
                // Start the delay timer.
                this._tooltipTimer = setTimeout(() => {
                    this._tooltipTimer  = null;
                    this._tooltipMode   = true;
                    this._tooltipVisible = true;
                    this._tooltipItemIdx = this.hoveredIdx;
                    if (this._onRedrawNeeded) this._onRedrawNeeded();
                }, TOOLTIP_DELAY_MS);
            }
        }

        // Re-render if hover highlight or tooltip visibility changed.
        return true;
    }

    // Handle a mouse-down event.
    // Returns true if the event was consumed (click was inside the menu, or menu was closed).
    // Returns false if the click was outside the menu.
    handleMouseDown(sx, sy) {
        const hit = this.hitTest(sx, sy);
        if (hit === -1) {
            this.hide();
            return false;
        }
        if (hit >= 0 && !this.items[hit].disabled) {
            this.items[hit].action();
        }
        this.hide();
        return true;
    }

    // ---- Rendering ----

    draw(ctx) {
        if (!this.visible) return;

        const menuH = PADDING * 2 + this.items.length * ITEM_H;

        ctx.save();

        // Background + border
        ctx.fillStyle   = COLOR_BG;
        ctx.strokeStyle = COLOR_BORDER;
        ctx.lineWidth   = 1;
        ctx.fillRect(this.sx, this.sy, ITEM_W, menuH);
        ctx.strokeRect(this.sx, this.sy, ITEM_W, menuH);

        // Items
        ctx.font         = FONT;
        ctx.textBaseline = 'middle';
        ctx.textAlign    = 'left';
        for (let i = 0; i < this.items.length; i++) {
            const item = this.items[i];
            const r    = this._getItemRect(i);

            const isItemHighlighted = (i === this.hoveredIdx && !item.disabled);
            if ( isItemHighlighted ) {
                ctx.fillStyle = COLOR_HIGHLIGHT_BG;
                ctx.fillRect(r.x, r.y, r.w, r.h);
            }

            if ( isItemHighlighted )
                ctx.fillStyle = COLOR_HIGHLIGHT_FG;
            else if ( item.disabled )
                ctx.fillStyle = COLOR_DISABLED;
            else
                ctx.fillStyle = COLOR_TEXT;
            ctx.fillText(item.label, r.x + 4, r.y + r.h / 2);
        }

        // Arc arrow overlay (on top of items, only for enabled items with arrowData)
        if (this.hoveredIdx >= 0) {
            const item = this.items[this.hoveredIdx];
            if (!item.disabled && item.arrowData) {
                this._drawArcArrow(ctx, item.arrowData);
            }
        }

        // Tooltip (on top of everything)
        if (this._tooltipVisible && this._tooltipItemIdx >= 0) {
            this._drawTooltip(ctx);
        }

        ctx.restore();
    }

    _drawTooltip(ctx) {
        const item = this.items[this._tooltipItemIdx];
        if (!item || !item.tooltip) return;

        const text = item.tooltip;
        ctx.save();
        ctx.font = FONT;
        const textW  = ctx.measureText(text).width;
        const boxW   = textW + TOOLTIP_PAD_H * 2;
        const boxH   = FONT_SIZE + TOOLTIP_PAD_V * 2;
        const itemR  = this._getItemRect(this._tooltipItemIdx);
        const boxX   = this.sx + ITEM_W + TOOLTIP_GAP;
        const boxY   = itemR.y + (itemR.h - boxH) / 2;

        ctx.fillStyle   = COLOR_BG;
        ctx.strokeStyle = COLOR_BORDER;
        ctx.lineWidth   = 1;
        ctx.fillRect(boxX, boxY, boxW, boxH);
        ctx.strokeRect(boxX, boxY, boxW, boxH);

        ctx.fillStyle    = COLOR_TEXT;
        ctx.textBaseline = 'middle';
        ctx.textAlign    = 'left';
        ctx.fillText(text, boxX + TOOLTIP_PAD_H, boxY + boxH / 2);
        ctx.restore();
    }

    // Draw a curved arc arrow from arrowData.{fromSX,fromSY} to {toSX,toSY}.
    // The arc bows upward (toward smaller screen y) and ends with an arrowhead.
    _drawArcArrow(ctx, { fromSX, fromSY, toSX, toSY }) {
        const chord = toSX - fromSX; // signed; negative when arrow goes left
        const L = Math.abs(chord);
        if (L < 1) return;

        const halfAngle = ARC_ANGLE / 2;
        const r  = L / (2 * Math.sin(halfAngle));
        const cx = (fromSX + toSX) / 2;
        // Center is BELOW the chord (larger screen y) so the arc bows UPWARD.
        const cy = fromSY + r * Math.cos(halfAngle);

        const startAngle    = Math.atan2(fromSY - cy, fromSX - cx);
        const endAngle      = Math.atan2(toSY   - cy, toSX   - cx);
        // chord < 0 -> going left -> use anticlockwise so the short upward arc is chosen.
        const anticlockwise = chord < 0;

        ctx.save();
        ctx.strokeStyle = COLOR_ARROW;
        ctx.lineWidth   = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, r, startAngle, endAngle, anticlockwise);
        ctx.stroke();

        // Arrowhead: step slightly backward along the arc to find the arrival tangent.
        // For a CW visual arc (anticlockwise=false) angles increase as we traverse,
        // so "just before the endpoint" is endAngle - eps.
        const eps       = 0.08;
        const backAngle = anticlockwise ? endAngle + eps : endAngle - eps;
        const backX     = cx + r * Math.cos(backAngle);
        const backY     = cy + r * Math.sin(backAngle);
        const dx        = toSX - backX;
        const dy        = toSY - backY;
        const len       = Math.hypot(dx, dy);
        if (len > 0) {
            let ux = dx / len, uy = dy / len; // unit vector of arrival direction
            let px = -uy,      py =  ux;      // perpendicular
            ux *= ARROW_HEAD_SIZE;
            uy *= ARROW_HEAD_SIZE;
            px *= ARROW_HEAD_SIZE * 0.5;
            py *= ARROW_HEAD_SIZE * 0.5;

            const tipSX = toSX + ux;
            const tipSY = toSY + uy;

            ctx.fillStyle = COLOR_ARROW;
            ctx.beginPath();
            ctx.moveTo( tipSX, tipSY );
            ctx.lineTo( tipSX - ux + px, tipSY - uy + py );
            ctx.lineTo( tipSX - ux - px, tipSY - uy - py );
            ctx.closePath();
            ctx.fill();
        }

        ctx.restore();
    }
}
