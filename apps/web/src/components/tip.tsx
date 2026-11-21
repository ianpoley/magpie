"use client";

import { createTooltipController, Tooltip, TooltipContent, TooltipTrigger } from "@ui-sdk/react/tooltip";
import { createContext, use, useState, type ReactElement, type ReactNode } from "react";

type TipController = ReturnType<typeof createTooltipController<string>>;

const TipContext = createContext<TipController | null>(null);

export function TipProvider({ children }: { children: ReactNode }) {
  const [controller] = useState(() => createTooltipController<string>());
  return (
    <TipContext value={controller}>
      {children}
      <Tooltip controller={controller} delay={400}>
        <TooltipContent<string>
          sideOffset={6}
          className="rounded-[8px] bg-ink px-2 py-1 text-[12px] font-medium text-surface transition-opacity duration-150 ease-out data-starting-style:opacity-0 data-ending-style:opacity-0 data-instant:transition-none"
        >
          {(state) => state.payload}
        </TooltipContent>
      </Tooltip>
    </TipContext>
  );
}

export function Tip({ label, children }: { label: string; children: ReactElement }) {
  const controller = use(TipContext);
  if (!controller) return children;
  return <TooltipTrigger controller={controller} payload={label} render={children} />;
}
