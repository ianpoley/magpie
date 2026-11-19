/** Stands in for `next/cache` when a server action runs outside Next. */
export const refreshes = { count: 0 };

export function refresh(): void {
  refreshes.count += 1;
}
