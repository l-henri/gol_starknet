'use client'

import { useEffect, useState } from 'react';
import ConnectButton from '@/components/connect-button';
import { useWallet } from '@/lib/wallet';
import { useGol } from '@/lib/useGol';
import { isConfigured } from '@/lib/contracts';
import {
  emptyGrid,
  randomGrid,
  nextGrid,
  gridToId,
  computeFate,
  type Grid,
  type Fate,
} from '@/lib/gameOfLife';

const FIND_INTERVAL = 90;
const PLAY_INTERVAL = 250;
const ONE_NUT = 1000000000000000000n;

const GameOfLife = () => {
  const [grid, setGrid] = useState<Grid>(() => emptyGrid());
  const [gameId, setGameId] = useState(0n);
  const [initialId, setInitialId] = useState<bigint | null>(null);
  const [generation, setGeneration] = useState(0);
  const [isFinding, setIsFinding] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [fate, setFate] = useState<Fate | null>(null);

  // On-chain
  const { address } = useWallet();
  const { mintLoop, mintPath, getNutBalance } = useGol();
  const [nutBalance, setNutBalance] = useState('0');
  const [txStatus, setTxStatus] = useState<string | null>(null);

  // Keep the displayed grid id in sync with the grid.
  useEffect(() => {
    setGameId(gridToId(grid));
  }, [grid]);

  // Load NUT balance for the connected wallet.
  useEffect(() => {
    if (!address) {
      setNutBalance('0');
      return;
    }
    let cancelled = false;
    getNutBalance(address)
      .then((b) => {
        if (!cancelled) setNutBalance((b / ONE_NUT).toString());
      })
      .catch(() => {
        if (!cancelled) setNutBalance('0');
      });
    return () => {
      cancelled = true;
    };
  }, [address, getNutBalance]);

  const resetFate = () => {
    setInitialId(null);
    setGeneration(0);
    setIsFinding(false);
    setFate(null);
    setTxStatus(null);
  };

  const toggleCell = (row: number, col: number) => {
    setGrid((prev) => prev.map((r, ri) => r.map((c, ci) => (ri === row && ci === col ? !c : c))));
    resetFate();
  };

  const handleRandom = () => {
    setGrid(randomGrid());
    resetFate();
  };

  const stepForward = () => setGrid((prev) => nextGrid(prev));

  // Find the fate up front (pure + deterministic), then animate the journey to it.
  const findFate = () => {
    const id = gridToId(grid);
    setInitialId(id);
    setGeneration(0);
    const result = computeFate(id);
    setFate(result);
    setIsFinding(result.found);
  };

  // Visual animation: Play = browse freely, Find = walk toward the discovered loop.
  useEffect(() => {
    if (!isPlaying && !isFinding) return;
    const intervalId = setInterval(
      () => {
        setGrid((prev) => nextGrid(prev));
        setGeneration((g) => g + 1);
      },
      isPlaying ? PLAY_INTERVAL : FIND_INTERVAL,
    );
    return () => clearInterval(intervalId);
  }, [isPlaying, isFinding]);

  // Stop the finding animation once it has reached and traversed the loop once.
  useEffect(() => {
    if (isFinding && fate?.found && generation >= fate.generationsToLoop + fate.loopLength) {
      setIsFinding(false);
    }
  }, [generation, isFinding, fate]);

  const handleMintLoop = async () => {
    if (!fate?.found || !address) return;
    setTxStatus('Confirm in your wallet…');
    try {
      const h = await mintLoop(fate.smallestLoopId, fate.loopLength, address);
      setTxStatus(`Submitted: ${h.slice(0, 10)}…`);
    } catch (err) {
      setTxStatus(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleMintPath = async () => {
    if (!fate?.found || fate.generationsToLoop === 0 || initialId === null || !address) return;
    setTxStatus('Confirm in your wallet…');
    try {
      const h = await mintPath(
        initialId,
        fate.generationsToLoop,
        fate.loopEntryId,
        fate.loopLength,
        address,
      );
      setTxStatus(`Submitted: ${h.slice(0, 10)}…`);
    } catch (err) {
      setTxStatus(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const canActOnChain = Boolean(address) && isConfigured();

  return (
    <div className="w-full max-w-6xl mx-auto p-8">
      <header className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Game of Immortal Lifeforms</h1>
        <div className="flex items-center gap-4 text-sm">
          {address && <span className="text-gray-600">NUT: {nutBalance}</span>}
          <ConnectButton />
        </div>
      </header>

      <div className="flex justify-between gap-8">
        {/* Left - controls */}
        <div className="flex flex-col gap-4 w-48">
          <button
            onClick={handleRandom}
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
              onClick={() => setIsFinding(false)}
              className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
            >
              Stop
            </button>
          )}
          <button
            onClick={resetFate}
            className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
          >
            Reset
          </button>
          {!isConfigured() && (
            <p className="text-xs text-amber-600">
              Contracts not configured — on-chain actions disabled. See .env.local.example.
            </p>
          )}
        </div>

        {/* Center - grid */}
        <div className="flex flex-col items-center gap-6">
          <div className="border border-gray-300 bg-white p-2">
            <div className="grid grid-cols-15 gap-px bg-gray-200">
              {grid.map((row, rowIndex) =>
                row.map((cell, colIndex) => (
                  <div
                    key={`${rowIndex}-${colIndex}`}
                    onClick={() => toggleCell(rowIndex, colIndex)}
                    className={`w-8 h-8 cursor-pointer transition-colors ${
                      cell ? 'bg-black' : 'bg-white hover:bg-gray-100'
                    }`}
                  />
                )),
              )}
            </div>
          </div>
          <div className="text-sm text-gray-600 break-all max-w-md text-center">
            Grid ID: {gameId.toString()}
          </div>
          <div className="flex gap-4">
            <button
              onClick={stepForward}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Step Forward
            </button>
            <button
              onClick={() => setIsPlaying((p) => !p)}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              {isPlaying ? 'Pause' : 'Play'}
            </button>
          </div>
        </div>

        {/* Right - fate + mint */}
        <div className="w-64">
          {fate && initialId !== null && (
            <div className="flex flex-col gap-3">
              <div className="text-sm text-gray-500">Generation: {generation}</div>
              {!fate.found ? (
                <div className="text-amber-600 text-sm">
                  No loop found within {fate.checkedGenerations.toLocaleString()} generations.
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="text-green-600 font-bold">
                    {fate.isLoop ? 'This pattern is a loop!' : 'Fate found!'}
                  </div>
                  {!fate.isLoop && (
                    <div className="text-sm">
                      A path of {fate.generationsToLoop} generation
                      {fate.generationsToLoop === 1 ? '' : 's'} into a loop.
                    </div>
                  )}
                  <div className="text-sm">Loop length: {fate.loopLength}</div>
                  <div className="text-xs text-gray-500 break-all">
                    Canonical loop id: {fate.smallestLoopId.toString()}
                  </div>

                  {canActOnChain ? (
                    <div className="flex flex-col gap-2 mt-1">
                      {!fate.isLoop && (
                        <button
                          onClick={handleMintPath}
                          className="px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700"
                        >
                          Mint this path ({fate.generationsToLoop} NUT)
                        </button>
                      )}
                      <button
                        onClick={handleMintLoop}
                        className="px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700"
                      >
                        {fate.isLoop ? 'Mint this loop' : 'Mint the loop it reaches'} ({fate.loopLength} NUT)
                      </button>
                    </div>
                  ) : (
                    <div className="text-xs text-gray-500 mt-1">Connect a wallet to mint.</div>
                  )}
                  {txStatus && <div className="text-xs text-gray-600 break-all">{txStatus}</div>}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GameOfLife;
