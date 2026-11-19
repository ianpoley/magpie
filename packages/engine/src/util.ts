export const MESSAGE_MAX_CHARS = 500;

export const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
