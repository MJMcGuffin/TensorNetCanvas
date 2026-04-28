import { StepByStepProcedure } from './StepByStepProcedure.js'
import { TensorNet } from './TensorNet.js'

// =====================================================================
// PAIR CONTRACTION PROCEDURE
//
// A two-step procedure that alternates between:
//   Step 0 - "Select next pair": picks the best-cost pair of connected
//             tensor nodes (per the chosen policy) and highlights them
//             via gui.systemSelectedNodes.
//   Step 1 - "Contract pair": contracts the selected pair and updates
//             the cumulative cost counter.
// =====================================================================

export class PairContractionProcedure extends StepByStepProcedure {
    constructor(gui) {
        super(gui, [
            {
                name: 'Select next pair',
                tooltip: 'Automatically selects the next pair of connected tensor nodes to contract, based on the chosen policy.',
                onExecute: () => this._doSelectNextPair(),
            },
            {
                name: 'Contract pair',
                tooltip: 'Contracts the currently selected pair of tensor nodes.',
                onExecute: () => this._doContractPair(),
            },
        ]);
        this.policy = TensorNet.COP_MIN;
        this._pendingNode1 = null;
        this._pendingNode2 = null;
    }

    /** Wire a <select> element so changing it updates this.policy. */
    bindPolicyDropdown(dropdownId) {
        const sel = document.getElementById(dropdownId);
        if (!sel) return;
        sel.addEventListener('change', () => {
            this.policy = parseInt(sel.value, 10);
        });
    }

    /** Override stop() to also clear the pending pair. */
    stop() {
        this._pendingNode1 = null;
        this._pendingNode2 = null;
        super.stop();
    }

    // ------------------------------------------------------------------
    // Private step implementations
    // ------------------------------------------------------------------

    _doSelectNextPair() {
        const net = window.tensorNet;
        const allNodes = new Set(net.nodes.values());
        const result = net._findNextIntraSetConnectedPair(allNodes, this.policy);
        if (result) {
            const [n1, n2] = result;
            this._pendingNode1 = n1;
            this._pendingNode2 = n2;
            this.gui.systemSelectedNodes.clear();
            this.gui.systemSelectedNodes.add(n1);
            this.gui.systemSelectedNodes.add(n2);
        } else {
            // No connected pairs remain in the network.
            this._pendingNode1 = null;
            this._pendingNode2 = null;
            this.gui.systemSelectedNodes.clear();
        }
        this.gui.render();
    }

    _doContractPair() {
        const net = window.tensorNet;
        const n1 = this._pendingNode1;
        const n2 = this._pendingNode2;

        // Guard: the nodes must still exist (they could have been removed externally).
        if (!n1 || !n2 || !net.nodes.has(n1.id) || !net.nodes.has(n2.id)) {
            this.gui.render();
            return;
        }

        const cost = net.computeContractionCost(n1, n2);
        const newX = (n1.x + n2.x) / 2;
        const newY = (n1.y + n2.y) / 2;

        this.gui.invalidateGeom(n1);
        this.gui.invalidateGeom(n2);

        const newNode = net.performSmartBinaryContraction(n1, n2);

        // Update cumulative cost display.
        this.gui.cumulativeCost += cost;
        document.getElementById('cumulativeCostDisplay').textContent =
            'Cumulative cost: ' + this.gui.cumulativeCost;

        // Position the result at the centroid of the contracted pair.
        if (newNode) {
            newNode.x = newX;
            newNode.y = newY;
            newNode.areCoordinatesInitialized = true;
            this.gui.systemSelectedNodes.clear();
            this.gui.systemSelectedNodes.add(newNode);
        } else {
            this.gui.systemSelectedNodes.clear();
        }

        this._pendingNode1 = null;
        this._pendingNode2 = null;

        this.gui._updatePanel();
        this.gui.render();
        this.gui._updateURL(true);
    }
}
