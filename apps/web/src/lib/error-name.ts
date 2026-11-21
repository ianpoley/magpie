export const errorName = (error: unknown): string => (error instanceof Error ? error.name : "unknown error");
