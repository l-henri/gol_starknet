// Using BigInt since regular Numbers in JavaScript can't safely handle 225 bits
const GRID_SIZE = 15;
const fps = 1; // Frames per second

// Configuration
const cellSize = 10; // Size of each cell in pixels

// Canvas Setup
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
canvas.width = 150;
canvas.height = 150;


/// Packing functions
function packGridToBigInt(grid) {
    // Input validation
    if (!Array.isArray(grid) || grid.length !== GRID_SIZE) {
        throw new Error(`Grid must be a ${GRID_SIZE}x${GRID_SIZE} array`);
    }
    if (!grid.every(row => Array.isArray(row) && row.length === GRID_SIZE)) {
        throw new Error(`Each row must contain ${GRID_SIZE} elements`);
    }

    let packedState = 0n;  // Using 0n for BigInt literal
    let power = 1n;

    for (let row = 0; row < GRID_SIZE; row++) {
        for (let col = 0; col < GRID_SIZE; col++) {
            if (grid[row][col] === true) {
                packedState += power;
            }
            power *= 2n;
        }
    }

    return packedState;
}

function unpackBigIntToGrid(state) {
    // Input validation
    if (typeof state !== 'bigint') {
        throw new Error('Input must be a BigInt');
    }
    if (state >= 2n ** BigInt(GRID_SIZE * GRID_SIZE)) {
        throw new Error('Input value too large for grid size');
    }

    const grid = Array(GRID_SIZE).fill().map(() => Array(GRID_SIZE).fill(false));
    let stateCopy = state;
    
    for (let row = 0; row < GRID_SIZE; row++) {
        for (let col = 0; col < GRID_SIZE; col++) {
            grid[row][col] = (stateCopy & 1n) === 1n;
            stateCopy = stateCopy >> 1n;  // Shift right to check next bit
        }
    }

    return grid;
}

/// Display function
function displayGrid(grid) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "white";
  for (let row = 0; row < grid.length; row++) {
    for (let col = 0; col < grid[row].length; col++) {
      if (grid[row][col]) {
        ctx.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
      }
    }
  }
}

function infiniteDisplayLoop(initialState) {
  const grid = unpackBigIntToGrid(initialState);
  displayGrid(grid);
  setTimeout(() => infiniteDisplayLoop(iterateLifeOnce(initialState)), 1000 / fps);
}
/// GOL Functions
function iterateLifeOnce(initialState) {
    // First unpack the state to a grid
    const grid = unpackBigIntToGrid(initialState);
    
    // Create new grid for the next state
    const nextGrid = Array(GRID_SIZE).fill().map(() => Array(GRID_SIZE).fill(false));
    
    // Go through each cell
    for (let row = 0; row < GRID_SIZE; row++) {
        for (let col = 0; col < GRID_SIZE; col++) {
            let neighboursCount = 0;
            
            // Calculate wrapped indices
            const rowAbove = ((row + GRID_SIZE - 1) % GRID_SIZE);
            const rowBelow = ((row + 1) % GRID_SIZE);
            const colLeft = ((col + GRID_SIZE - 1) % GRID_SIZE);
            const colRight = ((col + 1) % GRID_SIZE);
            
            // Count all 8 neighbors
            // 3 cells above
            if (grid[rowAbove][colLeft]) neighboursCount++;
            if (grid[rowAbove][col]) neighboursCount++;
            if (grid[rowAbove][colRight]) neighboursCount++;
            
            // Cells to the sides
            if (grid[row][colLeft]) neighboursCount++;
            if (grid[row][colRight]) neighboursCount++;
            
            // 3 cells below
            if (grid[rowBelow][colLeft]) neighboursCount++;
            if (grid[rowBelow][col]) neighboursCount++;
            if (grid[rowBelow][colRight]) neighboursCount++;
            
            // Apply Game of Life rules
            const isAlive = grid[row][col];
            nextGrid[row][col] = isAlive ? 
                (neighboursCount === 2 || neighboursCount === 3) : // Survival
                (neighboursCount === 3); // Birth
        }
    }
    
    // Pack the new grid back to a BigInt
    return packGridToBigInt(nextGrid);
}

function iterateLifeSeveralTimes(initialState, iterations) {
    let currentState = initialState;
    for (let i = 0; i < iterations; i++) {
        currentState = iterateLifeOnce(currentState);
        
        // Optional: display the grid after each iteration
        const grid = unpackBigIntToGrid(currentState);
        displayGrid(grid);  // Using the display function we created earlier
    }
    return currentState;
}

function run()
{
  const initialState = BigInt(939524096);
console.log('Initial value:', initialState.toString());

// Unpack to grid
const unpacked = unpackBigIntToGrid(initialState);
console.log('Unpacked grid:', unpacked);

// Pack back the grid
const packed = packGridToBigInt(unpacked);
console.log('Packed value:', packed.toString());

// runGameOfLife(initialState, 6);
infiniteDisplayLoop(initialState)
}

run()