import Link from "next/link";
import Garden from "@/components/Garden";

// The Garden ("/") — the living gallery. A quiet lead, then the dish itself.
export default function Home() {
  return (
    <>
      <header className="petri-lead">
        <span className="eyebrow">Conway’s Game of Life · living on Starknet</span>
        <p className="thesis">A garden of small creatures that learned to stay alive, and go on living forever.</p>
        <Link href="/why" className="thesis-why">why this exists →</Link>
      </header>
      <Garden />
    </>
  );
}
