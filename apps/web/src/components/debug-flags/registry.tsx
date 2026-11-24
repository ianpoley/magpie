"use client";

import { usePathname } from "next/navigation";
import { createContext, use, useCallback, useEffect, useId, useMemo, useState, type ReactNode } from "react";

import { debugFlagsEnabled } from "@/lib/debug-flags/define";
import type { DebugFlagSet } from "@/lib/debug-flags/types";

type Registration = { id: string; pathname: string; set: DebugFlagSet };

type Registry = {
  registrations: Registration[];
  register: (id: string, pathname: string, set: DebugFlagSet) => void;
  unregister: (id: string) => void;
};

const RegistryContext = createContext<Registry>({ registrations: [], register: () => {}, unregister: () => {} });

export function DebugFlagsRegistry({ children }: { children: ReactNode }) {
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const register = useCallback((id: string, pathname: string, set: DebugFlagSet) => {
    setRegistrations((current) => {
      const existing = current.find((entry) => entry.id === id);
      if (existing && existing.pathname === pathname && existing.set === set) return current;
      return [...current.filter((entry) => entry.id !== id), { id, pathname, set }];
    });
  }, []);
  const unregister = useCallback((id: string) => setRegistrations((current) => current.filter((entry) => entry.id !== id)), []);
  const value = useMemo(() => ({ registrations, register, unregister }), [registrations, register, unregister]);
  return <RegistryContext value={value}>{children}</RegistryContext>;
}

export function useRegisterDebugFlags(set: DebugFlagSet): void {
  const id = useId();
  const pathname = usePathname();
  const { register, unregister } = use(RegistryContext);
  useEffect(() => {
    if (!debugFlagsEnabled) return;
    register(id, pathname, set);
    return () => unregister(id);
  }, [id, pathname, set, register, unregister]);
}

export function RegisterDebugFlags({ flags }: { flags: DebugFlagSet }) {
  useRegisterDebugFlags(flags);
  return null;
}

export function useRegisteredDebugFlags(): DebugFlagSet[] {
  const pathname = usePathname();
  const { registrations } = use(RegistryContext);
  return useMemo(() => {
    const sets = new Set(registrations.filter((entry) => entry.pathname === pathname).map((entry) => entry.set));
    const routeOf = (set: DebugFlagSet) => Object.values(set)[0]?.routeId ?? "";
    return [...sets].sort((a, b) => routeOf(a).localeCompare(routeOf(b)));
  }, [registrations, pathname]);
}
