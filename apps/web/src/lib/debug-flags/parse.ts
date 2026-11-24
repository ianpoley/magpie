import type { DebugFlagDefinition, DebugFlagSet, DebugFlagValueOf, DebugSearchParams, NumberControl } from "./types.ts";

const isUrlSearchParams = (params: DebugSearchParams): params is URLSearchParams =>
  typeof (params as URLSearchParams).has === "function" && typeof (params as URLSearchParams).get === "function";

function rawValueIn(params: DebugSearchParams, key: string): string | undefined {
  if (isUrlSearchParams(params)) return params.has(key) ? (params.get(key) ?? "") : undefined;
  const value = params[key];
  if (value === undefined) return undefined;
  return Array.isArray(value) ? (value[0] ?? "") : value;
}

export const isFlagActiveIn = (params: DebugSearchParams, key: string): boolean => rawValueIn(params, key) !== undefined;

function clampNumber(value: number, control: NumberControl): number {
  let next = value;
  if (control.step && control.step > 0) {
    const base = control.min ?? 0;
    next = base + Math.round((next - base) / control.step) * control.step;
  }
  if (control.min !== undefined) next = Math.max(control.min, next);
  if (control.max !== undefined) next = Math.min(control.max, next);
  return next;
}

export function readFlagValueIn<D extends DebugFlagDefinition, R = DebugFlagValueOf<D>>(params: DebugSearchParams, flag: D, fallback: R): DebugFlagValueOf<D> | R {
  const raw = rawValueIn(params, flag.key);
  if (raw === undefined) return fallback;
  const control = flag.control;
  if (!control || control.type === "boolean") return true as DebugFlagValueOf<D> | R;
  if (control.type === "number") {
    const parsed = raw.trim() === "" ? Number.NaN : Number(raw);
    return (Number.isFinite(parsed) ? clampNumber(parsed, control) : fallback) as DebugFlagValueOf<D> | R;
  }
  if (control.type === "enum") return (control.options.includes(raw) ? raw : fallback) as DebugFlagValueOf<D> | R;
  return raw as DebugFlagValueOf<D> | R;
}

const queryPart = (key: string, value: string): string =>
  value === "" ? encodeURIComponent(key) : `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;

export const bareQueryString = (params: URLSearchParams): string => [...params].map(([key, value]) => queryPart(key, value)).join("&");

export function flagQueryIn(params: DebugSearchParams, sets: DebugFlagSet[]): string {
  const parts: string[] = [];
  for (const flag of sets.flatMap((set) => Object.values(set))) {
    const raw = rawValueIn(params, flag.key);
    if (raw !== undefined) parts.push(queryPart(flag.key, raw));
  }
  return parts.join("&");
}

export function withFlag(search: string, key: string, value: string | null): string {
  const params = new URLSearchParams(search);
  if (value === null) params.delete(key);
  else params.set(key, value);
  return bareQueryString(params);
}
