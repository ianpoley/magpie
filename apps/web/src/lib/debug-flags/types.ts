export type BooleanControl = { type: "boolean" };
export type NumberControl = { type: "number"; min?: number; max?: number; step?: number };
export type EnumControl<TOption extends string = string> = { type: "enum"; options: readonly TOption[] };
export type TextControl = { type: "text" };

export type DebugFlagControl = BooleanControl | NumberControl | EnumControl | TextControl;

export type DebugFlagDefinition<C extends DebugFlagControl | undefined = DebugFlagControl | undefined> = {
  routeId: string;
  key: string;
  label: string;
  description: string;
  control?: C;
};

export type DebugFlagSpec<C extends DebugFlagControl = DebugFlagControl> = {
  key?: string;
  label: string;
  description: string;
  control?: C;
};

export type DebugFlagSet = Record<string, DebugFlagDefinition>;

export type DebugFlagValue<C extends DebugFlagControl | undefined> = [C] extends [NumberControl]
  ? number
  : [C] extends [EnumControl<infer O>]
    ? O
    : [C] extends [TextControl]
      ? string
      : boolean;

export type DebugFlagValueOf<D extends DebugFlagDefinition> = D extends DebugFlagDefinition<infer C> ? DebugFlagValue<C> : never;

type ResolvedControl<C> = [Exclude<C, undefined>] extends [never]
  ? undefined
  : Exclude<C, undefined> extends DebugFlagControl
    ? Exclude<C, undefined>
    : undefined;

export type DebugFlagSetFor<T extends Record<string, DebugFlagSpec>> = {
  [K in keyof T]: DebugFlagDefinition<ResolvedControl<T[K]["control"]>>;
};

export type DebugSearchParams = URLSearchParams | Record<string, string | string[] | undefined>;
