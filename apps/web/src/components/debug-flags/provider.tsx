"use client";

import { Suspense, type ReactNode } from "react";

import { debugFlagsEnabled } from "@/lib/debug-flags/define";

import { DebugFlagsLauncher } from "./launcher";
import { DebugFlagsRegistry } from "./registry";

export function DebugFlagsProvider({ children }: { children: ReactNode }) {
  if (!debugFlagsEnabled) return children;
  return (
    <DebugFlagsRegistry>
      {children}
      <Suspense fallback={null}>
        <DebugFlagsLauncher />
      </Suspense>
    </DebugFlagsRegistry>
  );
}
