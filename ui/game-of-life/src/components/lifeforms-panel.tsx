"use client";

import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@/lib/wallet";
import { useGol, type OwnedLifeform } from "@/lib/useGol";
import { isConfigured } from "@/lib/contracts";
import GridPreview from "./grid-preview";

export default function LifeformsPanel() {
  const { address } = useWallet();
  const { listOwnedLifeforms, getLifeform, moveForward } = useGol();
  const [items, setItems] = useState<OwnedLifeform[]>([]);
  const [loading, setLoading] = useState(false);
  const [lookup, setLookup] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!address) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      setItems(await listOwnedLifeforms(address));
    } finally {
      setLoading(false);
    }
  }, [address, listOwnedLifeforms]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleLookup = async () => {
    let id: bigint;
    try {
      id = BigInt(lookup.trim());
    } catch {
      setStatus("Enter a numeric token id.");
      return;
    }
    const lf = await getLifeform(id);
    if (!lf) {
      setStatus("No lifeform with that id.");
      return;
    }
    setStatus(null);
    setItems((prev) => (prev.some((x) => x.tokenId === lf.tokenId) ? prev : [lf, ...prev]));
  };

  const handleBreathe = async (tokenId: bigint) => {
    setStatus("Confirm in your wallet…");
    try {
      const hashStr = await moveForward(tokenId);
      setStatus(`Submitted: ${hashStr.slice(0, 10)}… (refresh in a few seconds)`);
    } catch (err) {
      setStatus(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Contracts not deployed yet — nothing to show.
  if (!isConfigured()) return null;

  return (
    <section className="w-full max-w-6xl mx-auto px-8 pb-16">
      <h2 className="text-2xl font-bold mb-4">Lifeforms</h2>

      {!address ? (
        <p className="text-gray-600">Connect a wallet to see the lifeforms you own.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <input
              value={lookup}
              onChange={(e) => setLookup(e.target.value)}
              placeholder="Look up a token id…"
              className="border rounded px-2 py-1 text-sm w-64"
            />
            <button
              onClick={handleLookup}
              className="px-3 py-1 text-sm rounded bg-gray-700 text-white hover:bg-gray-800"
            >
              Look up
            </button>
            <button
              onClick={refresh}
              className="px-3 py-1 text-sm rounded border hover:bg-gray-100"
            >
              {loading ? "Loading…" : "Refresh mine"}
            </button>
          </div>

          {status && <p className="text-xs text-gray-600 mb-3 break-all">{status}</p>}
          {items.length === 0 && !loading && (
            <p className="text-gray-500">No lifeforms yet — discover and mint one above.</p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((lf) => (
              <div key={lf.tokenId.toString()} className="border rounded-lg p-4 flex gap-4">
                <GridPreview id={lf.data.currentState} />
                <div className="text-sm flex flex-col gap-1 min-w-0">
                  <div className="font-mono text-xs text-gray-500 truncate" title={lf.tokenId.toString()}>
                    #{lf.tokenId.toString()}
                  </div>
                  <div>
                    {lf.data.isLoop ? "Loop" : "Path"}
                    {lf.data.isStill ? " · still life" : ""}
                  </div>
                  <div>
                    {lf.data.isAlive ? "Alive" : "Dead"} · age {lf.data.age}
                  </div>
                  <div className="text-gray-500">sequence {lf.data.sequenceLength}</div>
                  <button
                    onClick={() => handleBreathe(lf.tokenId)}
                    className="mt-1 px-3 py-1 rounded bg-sky-600 text-white text-xs hover:bg-sky-700 self-start"
                  >
                    Breathe life (+1 NUT)
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
