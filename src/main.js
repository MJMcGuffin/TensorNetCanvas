import { TensorNetGUI } from './tensor/GUI.js'


// Initialize after DOM loads
window.addEventListener('DOMContentLoaded', () => {
    // Add this to the global object so it's accessible for debugging
    window.tensorNetGUI = new TensorNetGUI();
});



