/**
 * Makes model-written text safe to store and show as a plain label: no HTML
 * tags, no Markdown syntax, no control or invisible formatting characters,
 * single-spaced, and at most `maxChars` characters. May return ''.
 */
export function cleanLabel(value: string, maxChars: number): string {
  const cleaned = value
    .replace(/<[^>]*>/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\s/g, ' ')
    .replace(/[\p{Cc}\p{Cf}\p{Co}\p{Cn}]/gu, '')
    .replace(/[<>`*]/g, '')
    .replace(/^[#\s]+/, '')
    .replace(/ {2,}/g, ' ')
    .trim();
  return Array.from(cleaned).slice(0, maxChars).join('').trim();
}
