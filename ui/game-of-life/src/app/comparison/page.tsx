'use client'

import React, { useState, useEffect, useCallback } from 'react';

const GRID_SIZE = 16;

export default function ComparisonPage() {
  // Canvas (left) grid state
  const [canvasGrid, setCanvasGrid] = useState(() => 
    Array(GRID_SIZE).fill().map(() => Array(GRID_SIZE).fill(false))
  );
  const [canvasId, setCanvasId] = useState(0n);
  
  // Render (right) grid state
  const [renderGrid, setRenderGrid] = useState(() => 
    Array(GRID_SIZE).fill().map(() => Array(GRID_SIZE).fill(false))
  );
  const [renderGeneration, setRenderGeneration] = useState(0);

  // Function to calculate grid ID
  const calculateGridId = useCallback((grid: boolean[][]) => {
    let newId = 0n;
    let power = 1n;
    
    for (let row = 0; row < GRID_SIZE; row++) {
      for (let col = 0; col < GRID_SIZE; col++) {
        if (grid[row][col]) {
          newId += power;
        }
        power *= 2n;
      }
    }
    
    return newId;
  }, []);

  // Function to toggle a cell in the canvas
  const toggleCanvasCell = (row: number, col: number) => {
    const newGrid = canvasGrid.map((r, rowIndex) =>
      r.map((cell, colIndex) =>
        rowIndex === row && colIndex === col ? !cell : cell
      )
    );
    setCanvasGrid(newGrid);
    const newId = calculateGridId(newGrid);
    setCanvasId(newId);
    
    // Reset render grid with the new pattern
    setRenderGrid(newGrid);
    setRenderGeneration(0);
  };

  // Function to compute next generation
  const computeNextGeneration = useCallback((grid: boolean[][]) => {
    return grid.map((row, rowIndex) =>
      row.map((cell, colIndex) => {
        let neighbors = 0;
        
        for (let i = -1; i <= 1; i++) {
          for (let j = -1; j <= 1; j++) {
            if (i === 0 && j === 0) continue;
            
            const newRow = (rowIndex + i + GRID_SIZE) % GRID_SIZE;
            const newCol = (colIndex + j + GRID_SIZE) % GRID_SIZE;
            
            if (grid[newRow][newCol]) neighbors++;
          }
        }
        
        return cell
          ? neighbors === 2 || neighbors === 3
          : neighbors === 3;
      })
    );
  }, []);

  // Effect for render grid animation
  useEffect(() => {
    const intervalId = setInterval(() => {
      setRenderGrid(prevGrid => computeNextGeneration(prevGrid));
      setRenderGeneration(prev => prev + 1);
    }, 100);
    
    return () => clearInterval(intervalId);
  }, [computeNextGeneration]);

  return (
    <div className="flex justify-center w-full max-w-7xl mx-auto p-8">
      {/* Left side - Canvas */}
      <div className="flex flex-col items-center gap-8 mr-16">
        <h2 className="text-2xl font-bold">Canvas</h2>
        <div className="border border-gray-300 bg-white p-2">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(16, minmax(0, 1fr))', gap: '1px', backgroundColor: '#E5E7EB' }}>
            {canvasGrid.map((row, rowIndex) => (
              row.map((cell, colIndex) => (
                <div
                  key={`canvas-${rowIndex}-${colIndex}`}
                  onClick={() => toggleCanvasCell(rowIndex, colIndex)}
                  className={`w-8 h-8 cursor-pointer transition-colors ${
                    cell ? 'bg-black' : 'bg-white hover:bg-gray-100'
                  }`}
                />
              ))
            ))}
          </div>
        </div>
        <div className="text-lg">
          Grid ID: {canvasId.toString()}
        </div>
      </div>

      {/* Right side - Render */}
      <div className="flex flex-col items-center gap-8">
        <h2 className="text-2xl font-bold">Render</h2>
        <div className="border border-gray-300 bg-white p-2">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(16, minmax(0, 1fr))', gap: '1px', backgroundColor: '#E5E7EB' }}>
            {renderGrid.map((row, rowIndex) => (
              row.map((cell, colIndex) => (
                <div
                  key={`render-${rowIndex}-${colIndex}`}
                  className={`w-8 h-8 ${
                    cell ? 'bg-black' : 'bg-white'
                  }`}
                />
              ))
            ))}
          </div>
        </div>
        <div className="text-lg">
          Generation: {renderGeneration}
        </div>
      </div>
    </div>
  );
}