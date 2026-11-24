"use client";

import { useLayoutEffect, useRef } from "react";

export function FadeImg({ src, className }: { src: string; className: string }) {
  const ref = useRef<HTMLImageElement>(null);
  useLayoutEffect(() => {
    const img = ref.current;
    if (img && !img.complete) img.setAttribute("data-pending", "");
  }, [src]);
  const settle = () => ref.current?.removeAttribute("data-pending");
  return (
    // eslint-disable-next-line @next/next/no-img-element -- remote X media, shown as saved; nothing to optimize locally
    <img ref={ref} src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onLoad={settle} onError={settle} className={`img-fade ${className}`} />
  );
}
