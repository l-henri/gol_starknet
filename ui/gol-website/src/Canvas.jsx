import React, { useState, useEffect } from 'react';

const GRID_SIZE = 15;

const Canvas = ({ onGridChange }) => {
  // Initialize empty grid
  const [grid, setGrid] = useState(() => 
    Array(GRID_SIZE).fill().map(() => 
      Array(GRID_SIZE).fill(false)
    )
  );

  // Calculate grid ID
  const calculateGridId = (currentGrid) => {
    let newId = 0n;
    let power = 1n;
    
    for (let row = 0; row < GRID_SIZE; row++) {
      for (let col = 0; col < GRID_SIZE; col++) {
        if (currentGrid[row][col]) {
          newId += power;
        }
        power *= 2n;
      }
    }
    return newId;
  };

  // Handle cell click
  const handleCellClick = (row, col) => {
    const newGrid = grid.map((rowArray, rowIndex) =>
      rowArray.map((cell, colIndex) =>
        rowIndex === row && colIndex === col ? !cell : cell
      )
    );
    
    // Update grid state
    setGrid(newGrid);
    
    // Calculate and send new ID immediately with the new grid
    const newId = calculateGridId(newGrid);
    console.log('Canvas: Sending new grid ID:', newId.toString());
    onGridChange(newId);
  };

  return (
    <div className="inline-block bg-white p-2 rounded-lg">
      <div className="grid gap-1" 
           style={{ 
             gridTemplateColumns: `repeat(${GRID_SIZE}, minmax(0, 1fr))`,
             width: 'fit-content'
           }}>
        {grid.map((row, rowIndex) =>
          row.map((cell, colIndex) => (
            <div
              key={`${rowIndex}-${colIndex}`}
              className={`w-6 h-6 border cursor-pointer transition-colors duration-150
                ${cell ? 'bg-black' : 'bg-white'}
                hover:bg-gray-400`}
              onClick={() => handleCellClick(rowIndex, colIndex)}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default Canvas;