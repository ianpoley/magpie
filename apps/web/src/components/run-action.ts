import { toast } from "@ui-sdk/react/toast";

import type { ActionResult } from "@/lib/types";

type Done<T> = Extract<ActionResult<T>, { ok: true }>;

export async function runAction<T>(action: Promise<ActionResult<T>>): Promise<Done<T> | null> {
  try {
    const result = await action;
    if (result.ok) return result;
    toast.error(result.message);
  } catch {
    toast.error("The change could not be saved.");
  }
  return null;
}
