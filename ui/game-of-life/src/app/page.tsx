import Garden from "@/components/Garden";

export default function Home() {
  return (
    <>
      <section className="hero wrap">
        <span className="kicker">Conway&rsquo;s Game of Life · on Starknet</span>
        <h1>Digital&nbsp;Bacteria</h1>
        <p className="sub">Living Petri Dish</p>
        <p className="thesis">
          A tended garden of autonomous creatures. Watch them breathe, keep each other&rsquo;s alive,
          and set your own discovery free — to live forever, independent of you.
        </p>
      </section>
      <Garden />
    </>
  );
}
