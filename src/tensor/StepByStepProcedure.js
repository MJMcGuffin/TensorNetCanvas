// =====================================================================
// STEP-BY-STEP PROCEDURE (generic)
//
// Usage:
//   const proc = new MyProcedure(gui);          // subclass sets up steps
//   proc.bindToPanel({ startBtnId, nextBtnId, stopBtnId,
//                      statusLabelId, stepListId });
//   proc.bindPolicyDropdown('myPolicySelect'); // optional, in subclass
// =====================================================================

export class StepByStepProcedure {
    /**
     * @param {object} gui   - TensorNetGUI instance
     * @param {Array}  steps - [{name: string, tooltip: string, onExecute: function}]
     */
    constructor(gui, steps) {
        this.gui   = gui;
        this.steps = steps;
        this.currentStepIndex = 0;
        this.isRunning = false;

        // DOM element references - set by bindToPanel()
        this._startBtn    = null;
        this._nextBtn     = null;
        this._stopBtn     = null;
        this._statusLabel = null;
        this._stepListEl  = null;
    }

    /**
     * Wire this procedure to the HTML panel widgets.
     * @param {object} ids - { startBtnId, nextBtnId, stopBtnId, statusLabelId, stepListId }
     */
    bindToPanel({ startBtnId, nextBtnId, stopBtnId, statusLabelId, stepListId }) {
        this._startBtn    = document.getElementById(startBtnId);
        this._nextBtn     = document.getElementById(nextBtnId);
        this._stopBtn     = document.getElementById(stopBtnId);
        this._statusLabel = document.getElementById(statusLabelId);
        this._stepListEl  = document.getElementById(stepListId);

        this._startBtn.addEventListener('click', () => this.start());
        this._nextBtn.addEventListener('click',  () => this.nextStep());
        this._stopBtn.addEventListener('click',  () => this.stop());

        this._updatePanelUI();
    }

    /** Enter step-by-step mode: lock UI and reset to first step. */
    start() {
        this.isRunning = true;
        this.currentStepIndex = 0;
        this.gui.setUserInterfaceLock(true);
        this._updatePanelUI();
    }

    /** Execute the current step, then advance to the next. */
    nextStep() {
        if (!this.isRunning) return;
        this.steps[this.currentStepIndex].onExecute();
        this.currentStepIndex = (this.currentStepIndex + 1) % this.steps.length;
        this._updatePanelUI();
    }

    /**
     * Exit step-by-step mode: clear system selection and unlock UI.
     * Subclasses may override to add cleanup, but must call super.stop().
     */
    stop() {
        this.isRunning = false;
        this.gui.systemSelectedNodes.clear();
        this.gui.setUserInterfaceLock(false);
        this.gui.render();
        this._updatePanelUI();
    }

    /** Synchronise the panel widgets with the current procedure state. */
    _updatePanelUI() {
        if (!this._startBtn) return; // not yet bound

        this._startBtn.disabled = this.isRunning;
        this._nextBtn.disabled  = !this.isRunning;
        this._stopBtn.disabled  = !this.isRunning;

        if (this._statusLabel) {
            this._statusLabel.textContent = this.isRunning
                ? '🔒UI is locked. Press Stop to unlock.'
                : '🔓UI is unlocked';
        }

        if (this._stepListEl) {
            this._stepListEl.innerHTML = '';
            for (let i = 0; i < this.steps.length; i++) {
                const div = document.createElement('div');
                div.style.cssText = 'color:#0a0;font-size:11px;padding:2px 0;font-family:\'Courier New\',monospace;';
                const isCurrent = this.isRunning && i === this.currentStepIndex;
                div.textContent = (isCurrent ? '▶ ' : '\u00a0\u00a0') + this.steps[i].name;
                if (this.steps[i].tooltip) div.title = this.steps[i].tooltip;
                this._stepListEl.appendChild(div);
            }
        }
    }
}
