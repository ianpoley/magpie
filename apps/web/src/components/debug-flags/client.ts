"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

import { debugFlagsEnabled } from "@/lib/debug-flags/define";
import { flagQueryIn, isFlagActiveIn, readFlagValueIn, withFlag } from "@/lib/debug-flags/parse";
import type { DebugFlagDefinition, DebugFlagSet, DebugFlagValueOf } from "@/lib/debug-flags/types";

export { RegisterDebugFlags, useRegisterDebugFlags } from "./registry";

function useDebugFlagLive<T>(flag: DebugFlagDefinition, real: T, fake: T): T {
  return isFlagActiveIn(useSearchParams(), flag.key) ? fake : real;
}

function useDebugFlagActiveLive(flag: DebugFlagDefinition): boolean {
  return isFlagActiveIn(useSearchParams(), flag.key);
}

function useDebugFlagValueLive<D extends DebugFlagDefinition, R = DebugFlagValueOf<D>>(flag: D, real: R): DebugFlagValueOf<D> | R {
  return readFlagValueIn(useSearchParams(), flag, real);
}

function useDebugFlagQueryLive(sets: DebugFlagSet[]): string {
  return flagQueryIn(useSearchParams(), sets);
}

export const useDebugFlag: typeof useDebugFlagLive = debugFlagsEnabled ? useDebugFlagLive : (_flag, real) => real;

export const useDebugFlagActive: typeof useDebugFlagActiveLive = debugFlagsEnabled ? useDebugFlagActiveLive : () => false;

export const useDebugFlagValue: typeof useDebugFlagValueLive = debugFlagsEnabled ? useDebugFlagValueLive : (_flag, real) => real;

export const useDebugFlagQuery: typeof useDebugFlagQueryLive = debugFlagsEnabled ? useDebugFlagQueryLive : () => "";

export const joinQuery = (...parts: string[]): string => parts.filter(Boolean).join("&");

export function useSetDebugFlag(): { setFlag: (key: string, value: string | null) => void; linkTo: (key: string, value: string) => string } {
  const router = useRouter();
  const setFlag = useCallback(
    (key: string, value: string | null) => {
      const query = withFlag(window.location.search, key, value);
      router.replace(`${window.location.pathname}${query ? `?${query}` : ""}`, { scroll: false });
    },
    [router],
  );
  const linkTo = useCallback((key: string, value: string) => `${window.location.origin}${window.location.pathname}?${withFlag("", key, value)}`, []);
  return { setFlag, linkTo };
}
