import React, { useState } from 'react';
import Canvas from './Canvas';
import Runner from './Runner';

const App = () => {
  const [currentGridId, setCurrentGridId] = useState(0n);

  const handleGridChange = (newGridId) => {
    setCurrentGridId(newGridId);
    console.log('New Grid ID:', newGridId.toString()); // For debugging
  };

  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="container mx-auto px-4">
        <h1 className="text-4xl font-bold text-gray-800 mb-8 text-center">Game of Life</h1>
        <div className="flex flex-col md:flex-row gap-8">
          <div className="flex-1 bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-2xl font-semibold text-gray-700 mb-4">Canvas</h2>
            <Canvas onGridChange={handleGridChange} />
          </div>
          <div className="flex-1 bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-2xl font-semibold text-gray-700 mb-4">Runner</h2>
            <Runner gridId={currentGridId} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;