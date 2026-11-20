// Throwaway: the "carry it home" flight shared by the variants.

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Flies a small clone of `make()` from `from` to the element matching `toSelector`, in an arc,
 * then gives the target a short bump. Skipped entirely under reduced motion.
 */
export function flyTo(from: Element, toSelector: string, make: () => HTMLElement, opts: { duration?: number; lift?: number } = {}) {
  const to = document.querySelector(toSelector);
  if (!to) return;
  const bump = () =>
    to.animate([{ scale: "1" }, { scale: "1.18" }, { scale: "1" }], { duration: 260, easing: "cubic-bezier(0.32, 0.72, 0, 1)" });
  if (reduced()) return;
  const a = from.getBoundingClientRect();
  const b = to.getBoundingClientRect();
  const node = make();
  Object.assign(node.style, { position: "fixed", left: `${a.left + a.width / 2}px`, top: `${a.top + a.height / 2}px`, zIndex: "2147483000", pointerEvents: "none" });
  document.body.appendChild(node);
  const dx = b.left + b.width / 2 - (a.left + a.width / 2);
  const dy = b.top + b.height / 2 - (a.top + a.height / 2);
  const lift = opts.lift ?? Math.min(140, Math.abs(dx) * 0.35 + 40);
  const anim = node.animate(
    [
      { transform: "translate(-50%, -50%) scale(1)", opacity: 1 },
      { transform: `translate(calc(-50% + ${dx * 0.5}px), calc(-50% + ${dy * 0.5 - lift}px)) scale(1.1)`, opacity: 1, offset: 0.5 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.5)`, opacity: 0.9 },
    ],
    { duration: opts.duration ?? 520, easing: "cubic-bezier(0.45, 0, 0.25, 1)" },
  );
  anim.onfinish = () => {
    node.remove();
    bump();
  };
}

export const prefersReducedMotion = reduced;
