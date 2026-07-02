"use client";

// Local (per-device) store for the Incubator: bookmarked-but-unminted creatures, and the progress of
// in-flight multi-transaction (partial-path) mints so a user can resume one they interrupted.
//
// Why localStorage: a bookmarked creature isn't on-chain (nothing to mint yet), and mint progress
// must be tracked precisely because `combine_partial_path` is NOT idempotent — re-running a completed
// step would corrupt the assembly. Failed steps are atomic multicalls (all-or-nothing), so resuming
// from the last *succeeded* step is always safe. (A future hardening could reconstruct progress from
// the on-chain PartialPathCreated/Combined events if localStorage is lost.)

/** Loop creature (canonical loop state) or path creature (transient into a loop). */
export type CreatureKind = "loop" | "path";

export type Bookmark = {
  id: string; // token id (0x hex)
  rows: number[]; // loop: canonical state; path: start state — 41 row bitmasks
  period: number; // loop: loop length; path: sequence_length (distance to loop)
  kind?: CreatureKind; // undefined = "loop" (back-compat with pre-path bookmarks)
  loopPeriod?: number; // path only: the terminal loop's period
  savedAt: number;
};

export type MintProgress = {
  id: string; // token id (0x hex)
  rows: number[]; // loop: canonical state; path: start state
  period: number; // loop: loop length; path: sequence_length
  kind?: CreatureKind; // undefined = "loop"
  loopPeriod?: number; // path only
  done: number; // number of plan steps completed
  total: number; // total plan steps
  updatedAt: number;
};

const BM_KEY = "gol:bookmarks";
const MP_PREFIX = "gol:mint-progress:";

function read<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, val: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(val));
  } catch {
    /* quota / disabled — non-fatal */
  }
}

/* ---------- bookmarks ---------- */

export function listBookmarks(): Bookmark[] {
  return read<Bookmark[]>(BM_KEY) ?? [];
}

export function isBookmarked(id: string): boolean {
  return listBookmarks().some((b) => b.id === id);
}

export function addBookmark(b: Bookmark) {
  const all = listBookmarks().filter((x) => x.id !== b.id);
  all.unshift(b);
  write(BM_KEY, all);
}

export function removeBookmark(id: string) {
  write(
    BM_KEY,
    listBookmarks().filter((b) => b.id !== id)
  );
}

/* ---------- in-progress mints ---------- */

export function getMintProgress(id: string): MintProgress | null {
  return read<MintProgress>(MP_PREFIX + id);
}

export function saveMintProgress(p: MintProgress) {
  write(MP_PREFIX + p.id, p);
}

export function clearMintProgress(id: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(MP_PREFIX + id);
  } catch {
    /* non-fatal */
  }
}

export function listMintProgress(): MintProgress[] {
  if (typeof window === "undefined") return [];
  const out: MintProgress[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i);
    if (k && k.startsWith(MP_PREFIX)) {
      const v = read<MintProgress>(k);
      if (v) out.push(v);
    }
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}
