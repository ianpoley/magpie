"use client";

import { useEffect, useRef, useState, type AnimationEvent, type ReactNode } from "react";

export type DeckFront = "filters" | "answer";

export type DeckState = { front: DeckFront };

const LABELS: Record<DeckFront, string> = { filters: "Filters", answer: "Answer" };
const ORDER: DeckFront[] = ["filters", "answer"];

export function SidebarDeck({ deck, filters, answer, onSwap }: { deck: DeckState; filters: ReactNode; answer: ReactNode; onSwap: (front: DeckFront) => void }) {
  const root = useRef<HTMLDivElement>(null);
  const focusedCard = useRef<DeckFront | null>(null);
  const { front } = deck;
  const [shown, setShown] = useState({ front, moved: false });
  if (shown.front !== front) setShown({ front, moved: true });
  const moved = shown.moved;
  const back = front === "filters" ? "answer" : "filters";

  useEffect(() => {
    const track = (event: FocusEvent) => {
      const card = event.target instanceof Element && root.current?.contains(event.target) ? event.target.closest<HTMLElement>("[data-card]") : null;
      focusedCard.current = (card?.dataset.card as DeckFront | undefined) ?? null;
    };
    document.addEventListener("focusin", track);
    return () => document.removeEventListener("focusin", track);
  }, []);

  useEffect(() => {
    const deck = root.current;
    if (!deck) return;
    const cancel = (event: globalThis.AnimationEvent) => {
      if (event.animationName.startsWith("deck-to-")) delete deck.dataset.swapping;
    };
    deck.addEventListener("animationcancel", cancel);
    return () => deck.removeEventListener("animationcancel", cancel);
  }, []);

  useEffect(() => {
    if (focusedCard.current === null || focusedCard.current === front) return;
    root.current?.querySelector<HTMLElement>(`[data-card="${front}"]`)?.focus({ preventScroll: true });
  }, [front]);

  const cards: Record<DeckFront, ReactNode> = { filters, answer };
  const swapping = (on: boolean) => (event: AnimationEvent) => {
    if (!event.animationName.startsWith("deck-to-") || !root.current) return;
    if (on) root.current.dataset.swapping = "";
    else delete root.current.dataset.swapping;
  };
  return (
    <div
      ref={root}
      className="deck"
      data-moved={moved ? "" : undefined}
      onAnimationStart={swapping(true)}
      onAnimationEnd={swapping(false)}
    >
      <div className="deck-bed bg-side" aria-hidden="true" />
      {ORDER.map((card) => (
        <div key={card} role="group" aria-label={LABELS[card]} tabIndex={-1} data-card={card} data-pos={card === front ? "front" : "back"} inert={card !== front} className="deck-card outline-none">
          {cards[card]}
        </div>
      ))}
      <button type="button" className="deck-peek" aria-label={`Bring ${LABELS[back].toLowerCase()} forward`} onClick={() => onSwap(back)} />
    </div>
  );
}
