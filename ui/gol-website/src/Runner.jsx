import React, { useState, useEffect, useCallback } from 'react';

const GRID_SIZE = 15;
const INTERVAL = 100;

const Runner = ({ gridId }) => {
  const [grid, setGrid] = useState(() => Array(GRID_SIZE).fill().map(() => Array(GRID_SIZE).fill(false)));
  const [isRunning, setIsRunning] = useState(true);
  const [lastReceivedId, setLastReceivedId] = useState(0n);
  const [generationCount, setGenerationCount] = useState(0);
  const [loopInfo, setLoopInfo] = useState(null);
  const [previousStates, setPreviousStates] = useState([]);

  // Convert grid to string for comparison
  const gridToString = (grid) => {
    return grid.map(row => row.map(cell => cell ? '1' : '0').join('')).join('');
  };

  // Convert grid ID back to boolean grid
  const idToGrid = useCallback((id) => {
    const newGrid = Array(GRID_SIZE).fill().map(() => Array(GRID_SIZE).fill(false));
    let currentId = id;
    
    for (let row = 0; row < GRID_SIZE; row++) {
      for (let col = 0; col < GRID_SIZE; col++) {
        if (currentId % 2n === 1n) {
          newGrid[row][col] = true;
        }
        currentId = currentId / 2n;
      }
    }
    return newGrid;
  }, []);

  // Count live neighbors (including toroidal wrapping)
  const countNeighbors = useCallback((grid, row, col) => {
    let count = 0;
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        if (i === 0 && j === 0) continue;
        const newRow = (row + i + GRID_SIZE) % GRID_SIZE;
        const newCol = (col + j + GRID_SIZE) % GRID_SIZE;
        if (grid[newRow][newCol]) count++;
      }
    }
    return count;
  }, []);

  // Calculate next generation
  const nextGeneration = useCallback((currentGrid) => {
    return currentGrid.map((row, rowIndex) =>
      row.map((cell, colIndex) => {
        const neighbors = countNeighbors(currentGrid, rowIndex, colIndex);
        if (cell) {
          return neighbors === 2 || neighbors === 3;
        } else {
          return neighbors === 3;
        }
      })
    );
  }, [countNeighbors]);

  // Check for loops
  const checkForLoop = useCallback((currentGrid) => {
    const currentState = gridToString(currentGrid);
    const stateIndex = previousStates.indexOf(currentState);
    
    if (stateIndex !== -1) {
      const loopLength = previousStates.length - stateIndex;
      const generationsToLoop = stateIndex;
      return {
        length: loopLength,
        generations: generationsToLoop
      };
    }
    return null;
  }, [previousStates]);

  // Effect to handle grid ID changes
  useEffect(() => {
    if (gridId !== undefined && gridId !== lastReceivedId) {
      const newGrid = idToGrid(gridId);
      setGrid(newGrid);
      setLastReceivedId(gridId);
      setIsRunning(true);
      setGenerationCount(0);
      setLoopInfo(null);
      setPreviousStates([gridToString(newGrid)]);
    }
  }, [gridId, idToGrid, lastReceivedId]);

  // Effect to handle animation
  useEffect(() => {
    let intervalId;

    if (isRunning) {
      intervalId = setInterval(() => {
        setGrid(currentGrid => {
          const nextGrid = nextGeneration(currentGrid);
          
          setGenerationCount(prev => prev + 1);
          
          // Only track states and check for loops if we haven't found one yet
          if (!loopInfo) {
            setPreviousStates(prev => [...prev, gridToString(nextGrid)]);
            const loop = checkForLoop(nextGrid);
            if (loop) {
              setLoopInfo(loop);
            }
          }
          
          return nextGrid;
        });
      }, INTERVAL);
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [isRunning, nextGeneration, checkForLoop, loopInfo]);

  return (
    <div className="inline-block">
      <div className={`grid gap-1 p-4 rounded-lg ${loopInfo ? 'bg-green-50' : 'bg-white'}`}
           style={{ 
             gridTemplateColumns: `repeat(${GRID_SIZE}, minmax(0, 1fr))`,
             width: 'fit-content'
           }}>
        {grid.map((row, rowIndex) =>
          row.map((cell, colIndex) => (
            <div
              key={`${rowIndex}-${colIndex}`}
              className={`w-6 h-6 border
                ${cell ? 'bg-black' : 'bg-white'}`}
            />
          ))
        )}
      </div>
      <div className="mt-4 space-y-2">
        {loopInfo && (
          <div className="p-3 bg-green-100 rounded text-sm">
            <p className="text-green-800">
              A loop appeared! It is {loopInfo.length} generations long
            </p>
            <p className="text-green-800">
              It took {loopInfo.generations} generations to get there
            </p>
          </div>
        )}
        <div className="flex items-center justify-between">
          <button 
            onClick={() => setIsRunning(prev => !prev)}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
          >
            {isRunning ? 'Pause' : 'Play'}
          </button>
          <span className="text-gray-600">
            Generation: {generationCount}
          </span>
        </div>
      </div>
    </div>
  );
};

export default Runner;