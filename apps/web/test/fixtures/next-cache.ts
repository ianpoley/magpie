export const refreshes = { count: 0 };

export function refresh(): void {
  refreshes.count += 1;
}
