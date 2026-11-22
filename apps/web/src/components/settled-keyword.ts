"use client";

import { useDeferredValue, useEffect, useState } from "react";

import { keywordMatcher } from "@/lib/search";
import type { Post } from "@/lib/types";

const SLOW_PASS_MS = 8;
const SETTLE_MS = 120;

export function useSettledKeyword(keyword: string, posts: Post[]): string {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => {
      const match = keywordMatcher("\u0000");
      posts.forEach(match);
      const started = performance.now();
      posts.forEach(match);
      setSlow(performance.now() - started > SLOW_PASS_MS);
    }, 0);
    return () => window.clearTimeout(id);
  }, [posts]);

  const [settled, setSettled] = useState(keyword);
  const immediate = !slow || keyword.trim() === "";
  if (immediate && settled !== keyword) setSettled(keyword);
  useEffect(() => {
    if (immediate || settled === keyword) return;
    const id = window.setTimeout(() => setSettled(keyword), SETTLE_MS);
    return () => window.clearTimeout(id);
  }, [immediate, keyword, settled]);

  return useDeferredValue(settled);
}
