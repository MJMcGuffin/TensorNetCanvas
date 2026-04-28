# TensorNetCanvas

No-backend web app for visualizing and simulating tensor networks and quantum circuits.
Bundled into a single static `index.html` for deployment.

## Build

```bash
make install   # one-time: installs Vite into node_modules/
make dev       # dev server at http://localhost:5173 with hot reload
make build     # produces dist/index.html (single self-contained file)
```

Bundler: Vite + vite-plugin-singlefile.

## Source files

```
index.html                      Vite entry point
src/
  main.js                       App entry: instantiates TensorNetGUI (from tensor/GUI.js)
  globals.js                    Global constants (8 lines)
  Util.js                       Util - assert, create1DArray, create2DArray, reverseEndianness (91 lines)
  MathUtil.js                   MathUtil - approximatelyEqual, isPrime, primeFactors with cached prime table (72 lines)
  StringUtil.js                 StringUtil - string formatting and manipulation helpers (95 lines)
  GeomUtil.js                   Vec2 - 2D vector/point; Box2 - 2D axis-aligned bounding box; GeomUtil - angleIn2D, isPointInPolygon
  Complex.js                    Complex - complex number arithmetic (163 lines)
  CMatrix.js                    CMatrix - complex matrix operations (411 lines)
  Sim.js                        Sim - quantum circuit simulator (1417 lines)
  PopupMenu.js                  PopupMenu - a popup menu (310 lines)
  tensor/
    CTensor.js                  CTensor - complex tensor storage (857 lines)
    TensorNode.js               TensorNode - a tensor within a tensor network (364 lines)
    TensorEdge.js               TensorEdge - an edge within a tensor network (30 lines)
    TensorNet.js                TensorNet - tensor network graph (1086 lines)
    GUI.js                      TensorNetGUI - canvas-based UI (1603 lines)
    Circuit.js                  Circuit, CircuitPart, Icon - quantum circuit representation (676 lines)
    circuitConversion.js        convertCircuitToTensorNet() - converts Circuit to TensorNet (270 lines)
```

## Dependency order

Each file imports only from files listed above it:

1. `globals.js`
2. `Util.js`
3. `MathUtil.js` ← globals, Util
4. `StringUtil.js` ← globals
5. `GeomUtil.js`
6. `Complex.js` ← globals, Util, GeomUtil, StringUtil
7. `CMatrix.js` ← globals, Util, MathUtil, StringUtil, Complex
8. `Sim.js` ← globals, Util, MathUtil, GeomUtil, StringUtil, CMatrix, Complex
9. `tensor/CTensor.js` ← globals, Util, StringUtil, Complex
10. `tensor/TensorNode.js` ← globals, Util, StringUtil, CTensor
11. `tensor/TensorEdge.js` ← TensorNode
12. `tensor/TensorNet.js` ← Util, CTensor, TensorNode, TensorEdge
13. `tensor/GUI.js` ← Util, MathUtil, StringUtil, GeomUtil, Sim, TensorNet
14. `tensor/Circuit.js` ← Util, StringUtil, Sim
15. `tensor/circuitConversion.js` ← CTensor, TensorNode, TensorEdge, Circuit
