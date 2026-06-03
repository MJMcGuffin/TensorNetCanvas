# <a href="https://mjmcguffin.github.io/TensorNetCanvas/">TensorNetCanvas</a>

TensorNetCanvas is a web-based visualizer and simulator for tensor networks.

## Creating Tensors

Tensors can be created manually by entering a nested array in the text field in the upper left part of the user interface.
For example, entering this string

    [[1,0],[0,-1]]

and hitting the "Create Tensor(s)" button will create a 2×2 tensor equivalent to a Pauli Z matrix.
The user can also enter a set of tensors, separated by spaces or commas or semicolons or newlines, such as

    [[0,1],[1,0]]; [[0,-i],[i,0]]; [[1,0],[0,-1]]; [[1,0],[0,i]]; [[1,0],[0,0.7071+0.7071i]]

to create the 3 Pauli matrices X, Y, Z, as well as an S and T matrix.
Alternatively, the user can enter tuples (with parentheses) containing a nested array followed by a name for the tensor, and optional names for each of the indices, such as

    ([[1,0],[0,i]],'S','out','in')

for a Pauli S matrix.
Multiple tensors can be entered, separated by spaces or commas or semicolons or newlines, such as

    ([[0,1],[1,0]],'X','out','in')
    ([[0,-i],[i,0]],'Y','out','in')
    ([[1,0],[0,-1]],'Z','out','in')
    ([[1,0],[0,i]],'S','out','in')
    ([[1,0],[0,0.707106781+0.707106781i]],'T','out','in')
    ([[0.707106781,0.707106781],[0.707106781,-0.707106781]],'H','out','in')

Each tensor is shown as a rectangle with tabs below it corresponding to the indices.
Edges can be created between tensors by dragging from one tab to another.
For example, if the user creates a Hadamard (H) matrix and a Pauli Z matrix, and drags from index 1 of the former to index 0 of the latter,
the result looks like this:

![Example 1](/figures/TensorNetCanvas-example1.png)

The user can then select both tensors (for example, by placing the cursor above and to the left of both tensors,
holding down the Ctrl key and the left mouse button, and dragging out a rectangle to select both),
and then press the "Contract selected" button.
This should result in a tensor equal to the matrix product of H and Z, i.e., [[0.707,-0.707],[0.707,0.707]].


TensorNetCanvas runs inside a web browser,
and the URL in the browser contains information encoding the structure of the tensors and the edges connecting them.
This means that tensor networks can be bookmarked, saved in a text file, and shared in an email.
As an example,
opening
<a href="https://mjmcguffin.github.io/TensorNetCanvas/#{%22nodes%22:[{%22nestedArray%22:%22[0,1,2]%22,%22name%22:%22%22,%22idxNames%22:[%22idx0%22],%22x%22:%22-32.414%22,%22y%22:%22-9.96%22},{%22nestedArray%22:%22[3,4,5]%22,%22name%22:%22%22,%22idxNames%22:[%22idx0%22],%22x%22:%22-25.849%22,%22y%22:%22-10.096%22},{%22nestedArray%22:%22[[0,1,2],[3,4,5],[6,7,8]]%22,%22name%22:%22%22,%22idxNames%22:[%22idx0%22,%22idx1%22],%22x%22:%22-32.767%22,%22y%22:%22-1.011%22},{%22nestedArray%22:%22[0,1,2]%22,%22name%22:%22%22,%22idxNames%22:[%22idx0%22],%22x%22:%22-25.559%22,%22y%22:%22-1.577%22},{%22nestedArray%22:%22[0,1,2]%22,%22name%22:%22%22,%22idxNames%22:[%22idx0%22],%22x%22:%22-32.814%22,%22y%22:%228.551%22},{%22nestedArray%22:%22[3,4,5]%22,%22name%22:%22%22,%22idxNames%22:[%22idx0%22],%22x%22:%22-26.396%22,%22y%22:%228.659%22},{%22nestedArray%22:%22[[1,2,3],[4,5,6],[7,8,9]]%22,%22name%22:%22%22,%22idxNames%22:[%22idx0%22,%22idx1%22],%22x%22:%22-28.155%22,%22y%22:%2230.828%22},{%22nestedArray%22:%22[[0.707107,0.707107],[0.707107,-0.707107]]%22,%22name%22:%22H%22,%22idxNames%22:[%22idx0%22,%22idx1%22],%22x%22:%22-37.589%22,%22y%22:%2218.443%22},{%22nestedArray%22:%22[[1,0],[0,-1]]%22,%22name%22:%22Z%22,%22idxNames%22:[%22idx0%22,%22idx1%22],%22x%22:%22-28.813%22,%22y%22:%2218.469%22},{%22nestedArray%22:%22[[0.707107,0.707107],[0.707107,-0.707107]]%22,%22name%22:%22H%22,%22idxNames%22:[%22idx0%22,%22idx1%22],%22x%22:%22-20.095%22,%22y%22:%2218.554%22}],%22edges%22:[[[0,0],[1,0]],[[2,1],[3,0]],[[6,0],[6,1]],[[7,1],[8,0]],[[8,1],[9,0]]]}">this link</a>
should show TensorNetCanvas with the below tensor network:

![Example 2](/figures/TensorNetCanvas-example2.png)

The above network contains several examples of operations.
Contracting the top two tensors is equivalent to performing a dot product of two vectors.
Contracting the next two is equivalent to a product of a matrix with a column vector.
Next, we have
the outer product of two vectors,
a product of three 2×2 matrices (yielding H Z H = X),
and the trace of a matrix.


## Mouse and keyboard controls

The lower left corner of the user interface contains a list of functions associated with mouse buttons and keyboard keys:

> Mouse controls:  
> Left drag on unselected node: move node  
> Left drag on selected node: move all selected nodes  
> Ctrl+click on node: toggle selection  
> Ctrl+drag on empty space: rectangle or lasso select  
> Left drag from index to index: create edge  
> Right click on index: menu  
> Left drag on empty space: pan  
> Scroll wheel: zoom in/out  
> Other controls:  
> Ctrl+A: select all nodes  
> Delete or Backspace: delete selected nodes  
> Browser Back/Forward: undo/redo  
> C: contract selected node(s)  
> F: frame all nodes

## Companion Video

A video demonstrating TensorNetCanvas's functionality:

<a href="https://youtu.be/MPuRhgFE7vU">View the video</a>


## Companion Paper

A companion paper is available (not yet published - email the author for a copy)
that explains the design and features of TensorNetCanvas
and gives more example tensors, including order-3 tensors.







## Importing circuits

A quantum circuit can be created inside
<a href="https://algassert.com/quirk">Quirk</a>
or
<a href="https://mjmcguffin.github.io/MuqcsCraft/">MuqcsCraft</a>,
and then the URL (which contains a description of the circuit) can be pasted into another text field
in TensorNetCanvas to import the circuit and convert it to a tensor network.

![Example 3](/figures/circuit-import-MuqcsCraft.png)

Above: a <a href="https://mjmcguffin.github.io/MuqcsCraft/?circuit={%22cols%22:[[%22H%22,%22H%22],[1,%22Y%22,%22%E2%97%A6%22],[%22%E2%80%A2%22,1,%22X%22],[1,1,%22Z%22],[%22%E2%80%A2%22,%22%E2%80%A2%22,%22X%22],[1,%22Z^%C2%BD%22]]}">circuit in MuqcsCraft</a>.

Below: the same circuit, after importing it into TensorNetCanvas.
Notice that each control or anticontrol qubit in the original circuit is converted to an order-3 tensor.

![Example 4](/figures/circuit-import-TensorNetCanvas.png)


## Programmatic manipulation of tensors

When TensorNetCanvas is running inside a web browser,
the user can open a JavaScript console and call subroutines inside the code programmatically.
The following lines of code can be pasted into the console; they illustrate how to create a few tensors and perform operations with them.

    // define two vectors and one matrix
    let v1 = CTensor.create([1,2,3]);
    let v2 = CTensor.create([4,5,6]);
    let m1 = CTensor.create([ [1,2,3], [4,5,6], [7,8,9] ]);
    // dot product of two vectors
    console.log( CTensor.einsum("i,i->",v1,v2).toString() );
    // outer product of two vectors
    console.log( CTensor.einsum("i,j->ij",v1,v2).toString() );
    // trace of matrix
    console.log( CTensor.einsum("ii->",m1).toString() );
    // product of matrix with column vector
    console.log( CTensor.einsum("ij,j->i",m1,v1).toString() );


