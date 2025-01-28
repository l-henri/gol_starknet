'use client'

import React, { useState, useEffect, useCallback } from 'react';

const GRID_SIZE = 15;

const GameOfLife = () => {
  // State for the grid
  const [grid, setGrid] = useState(() => 
    Array(GRID_SIZE).fill().map(() => Array(GRID_SIZE).fill(false))
  );
  
  //Game & display state
  const [gameId, setGameId] = useState(0n);
  const [initialId, setInitialId] = useState<bigint | null>(null);
  const [generation, setGeneration] = useState(0);
  const [isFinding, setIsFinding] = useState(false);
  const [isReset, setIsReset] = useState(true);  
  const [loopFound, setLoopFound] = useState(false);
  const [loopLength, setLoopLength] = useState<number | null>(null);
  const [smallestLoopId, setSmallestLoopId] = useState<bigint | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [seenStates, setSeenStates] = useState<Map<bigint, number>>(new Map());
  const [stateHistory, setStateHistory] = useState<bigint[]>([]);
  // Function to toggle a cell
  const toggleCell = (row: number, col: number) => {
    const newGrid = grid.map((r, rowIndex) =>
      r.map((cell, colIndex) =>
        rowIndex === row && colIndex === col ? !cell : cell
      )
    );
    setGrid(newGrid);
    updateGameId(newGrid);
  };
  // Function to update game ID from grid
  const updateGameId = useCallback((currentGrid: boolean[][]) => {
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
    
    setGameId(newId);
  }, []);
  
  // Function to compute next generation
  const computeNextGeneration = useCallback(() => {
    const newGrid = grid.map((row, rowIndex) =>
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
    
    setGrid(newGrid);
    updateGameId(newGrid);
  }, [grid, updateGameId]);
  
  const findFate = () => {
    if (isReset) {  // Only set initial values if we're in a reset state
      setInitialId(gameId);
      setGeneration(0);
    }
    setIsReset(false);
    setIsFinding(true);
  };
  
  const pauseFate = () => {
    setIsFinding(false);
  };
  
  const resetFate = () => {
    setInitialId(null);
    setGeneration(0);
    setIsFinding(false);
    setIsReset(true);
    setLoopFound(false);
    setLoopLength(null);
    setSmallestLoopId(null);
    setSeenStates(new Map());
    setStateHistory([]);
  };
  const detectLoop = useCallback((currentId: bigint) => {
    // Add the current state to our seen states
    const newSeen = new Map(seenStates);
    const firstOccurrence = newSeen.get(currentId);
    
    if (firstOccurrence !== undefined) {
      // We found a loop!
      const length = generation - firstOccurrence;
      
      // Find smallest ID in the loop
      let smallest = currentId;
      for (let i = firstOccurrence; i < generation; i++) {
        const stateId = stateHistory[i];
        if (stateId < smallest) {
          smallest = stateId;
        }
      }
      
      setLoopFound(true);
      setLoopLength(length);
      setSmallestLoopId(smallest);
      setIsFinding(false);  // Stop the simulation
    } else {
      newSeen.set(currentId, generation);
      setSeenStates(newSeen);
    }
  }, [generation, stateHistory]);
  const generateRandomGrid = () => {
    const newGrid = Array(GRID_SIZE).fill().map(() => 
      Array(GRID_SIZE).fill(false).map(() => 
        Math.random() < 0.3
      )
    );
    setGrid(newGrid);
    updateGameId(newGrid);
    resetFate();  // Reset fate when generating new random grid
  };
  // Effect for animation
  useEffect(() => {
    let intervalId: NodeJS.Timeout;
    
    if (isPlaying) {
      intervalId = setInterval(computeNextGeneration, 1000);
    } else if (isFinding) {
      intervalId = setInterval(() => {
        computeNextGeneration();
        setGeneration(prev => prev + 1);
        // Add current state to history
        setStateHistory(prev => [...prev, gameId]);
        // Check for loops
        detectLoop(gameId);
      }, 100);
    }
    
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isPlaying, isFinding, computeNextGeneration, gameId, detectLoop]);

  return (
    <div className="flex justify-between w-full max-w-6xl mx-auto p-8">
      {/* Left side - controls */}
      <div className="flex flex-col gap-4">
        <button
          onClick={generateRandomGrid}
          className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
        >
          Random Grid
        </button>
        
        {!isFinding ? (
          <button
            onClick={findFate}
            className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600"
          >
            Find My Fate
          </button>
        ) : (
          <button
            onClick={pauseFate}
            className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
          >
            Pause Fate Finding
          </button>
        )}

        <button
          onClick={resetFate}
          className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
        >
          Reset
        </button>
      </div>
  
      {/* Center - main game display */}
      <div className="flex flex-col items-center gap-8">
        <h1 className="text-3xl font-bold">Game of Life</h1>
        
        {/* Grid */}
        <div className="border border-gray-300 bg-white p-2">
          <div className="grid grid-cols-15 gap-px bg-gray-200">
            {grid.map((row, rowIndex) => (
              row.map((cell, colIndex) => (
                <div
                  key={`${rowIndex}-${colIndex}`}
                  onClick={() => toggleCell(rowIndex, colIndex)}
                  className={`w-8 h-8 cursor-pointer transition-colors ${
                    cell ? 'bg-black' : 'bg-white hover:bg-gray-100'
                  }`}
                />
              ))
            ))}
          </div>
        </div>
        
        {/* Game ID */}
        <div className="text-lg">
          Grid ID: {gameId.toString()}
        </div>
        
        {/* Play controls */}
        <div className="flex gap-4">
          <button
            onClick={computeNextGeneration}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Step Forward
          </button>
          
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            {isPlaying ? 'Pause' : 'Play'}
          </button>
        </div>
      </div>
  
      {/* Right side - fate status */}
      <div className="w-64">
      {!isReset && initialId && (
        <div className="flex flex-col gap-4">
          <div className="text-purple-600">
            Looking for the fate of {initialId.toString()}...
          </div>
          <div>
            Generation: {generation}
          </div>
          {loopFound && (
            <div className="flex flex-col gap-2">
              <div className="text-green-600 font-bold">
                Loop found!
              </div>
              <div>
                Loop length: {loopLength}
              </div>
              <div>
                Smallest ID in loop: {smallestLoopId?.toString()}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
    </div>
  );
};

export default GameOfLife;