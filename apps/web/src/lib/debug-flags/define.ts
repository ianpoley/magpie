import type { DebugFlagDefinition, DebugFlagSetFor, DebugFlagSpec } from "./types.ts";

export const debugFlagsEnabled = process.env.NODE_ENV === "development";

export const toKebabCase = (value: string): string =>
  value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();

export function defineDebugFlags<const T extends Record<string, DebugFlagSpec>>(routeId: string, specs: T): DebugFlagSetFor<T> {
  const set: Record<string, DebugFlagDefinition> = {};
  for (const [name, spec] of Object.entries(specs)) {
    set[name] = {
      routeId,
      key: spec.key ?? toKebabCase(name),
      label: spec.label,
      description: spec.description,
      ...(spec.control ? { control: spec.control } : {}),
    };
  }
  return set as DebugFlagSetFor<T>;
}
