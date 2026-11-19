import { toast } from "@ui-sdk/react/toast";

import type { ActionResult } from "@/lib/types";

type Done<T> = Extract<ActionResult<T>, { ok: true }>;

/**
 * Waits for one edit. A success comes back with the refreshed page; a failure
 * becomes an error toast and null, and the screen stays as it was.
 */
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
