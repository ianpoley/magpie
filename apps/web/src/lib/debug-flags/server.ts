import { debugFlagsEnabled } from "./define.ts";
import { isFlagActiveIn, readFlagValueIn } from "./parse.ts";
import type { DebugFlagDefinition, DebugFlagValueOf, DebugSearchParams } from "./types.ts";

export const getDebugFlag = <T>(params: DebugSearchParams, flag: DebugFlagDefinition, real: T, fake: T): T =>
  debugFlagsEnabled && isFlagActiveIn(params, flag.key) ? fake : real;

export const isDebugFlagActive = (params: DebugSearchParams, flag: DebugFlagDefinition): boolean =>
  debugFlagsEnabled && isFlagActiveIn(params, flag.key);

export const getDebugFlagValue = <D extends DebugFlagDefinition, R = DebugFlagValueOf<D>>(params: DebugSearchParams, flag: D, real: R): DebugFlagValueOf<D> | R =>
  debugFlagsEnabled ? readFlagValueIn(params, flag, real) : real;
