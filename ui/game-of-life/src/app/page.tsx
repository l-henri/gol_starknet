"use client";

import Garden from "@/components/Garden";
import { useT } from "@/lib/i18n";

export default function Home() {
  const { t } = useT();
  return (
    <>
      <section className="hero wrap">
        <span className="kicker">
          {t({ fr: "Le jeu de la vie de Conway · sur Starknet", en: "Conway’s Game of Life · on Starknet" })}
        </span>
        <h1>Digital&nbsp;Bacteria</h1>
        <p className="sub">{t({ fr: "Boîte de Pétri vivante", en: "Living Petri Dish" })}</p>
        <p className="thesis">
          {t({
            fr: "Un jardin de créatures autonomes que l’on cultive. Regarde-les respirer, garde-les en vie les unes les autres, et libère ta propre découverte — pour qu’elle vive à jamais, indépendante de toi.",
            en: "A tended garden of autonomous creatures. Watch them breathe, keep each other alive, and set your own discovery free — to live forever, independent of you.",
          })}
        </p>
      </section>
      <Garden />
    </>
  );
}
