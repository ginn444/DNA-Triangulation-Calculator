import React from 'react';
import { TriangulationCalculator } from './components/TriangulationCalculator';

function App() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <TriangulationCalculator />
      
      {/* Built with Bolt.new badge */}
      <a
        href="https://bolt.new"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-4 right-4 z-50 opacity-80 hover:opacity-100 transition-opacity duration-200"
      >
        <img
          src="https://bolt.new/badge.svg"
          alt="Built with Bolt.new"
          className="h-8 w-auto"
        />
      </a>
    </div>
  );
}

export default App;