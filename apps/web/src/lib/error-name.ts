/** What to log about an error: its name only, since a message can hold a secret. */
export const errorName = (error: unknown): string => (error instanceof Error ? error.name : "unknown error");
