import { TextDecoder } from 'node:util';

/**
 * One HTTP request. It never follows a redirect: a 3xx comes back with its
 * `location` header so the caller decides whether to follow. Header names are
 * lowercase. `body` is at most `maxBytes` of a successful text response
 * and empty for anything else. A timeout or network failure rejects.
 */
export type HttpRequest = {
  url: string;
  timeoutMs: number;
  maxBytes: number;
  headers?: Record<string, string>;
};

export type HttpResponse = {
  status: number;
  headers: Record<string, string>;
  body: string;
};

export type HttpFetch = (request: HttpRequest) => Promise<HttpResponse>;

const DEFAULT_HEADERS = {
  'user-agent': 'Mozilla/5.0 (compatible; link-preview/1.0)',
  accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
  'accept-language': 'en',
};

const TEXT_TYPE = /^\s*(text\/|application\/(json|xml|xhtml\+xml|[a-z.+-]*\+json))/i;

function decoderFor(contentType: string): TextDecoder {
  const charset = /charset\s*=\s*"?([\w-]+)/i.exec(contentType)?.[1];
  try {
    return new TextDecoder(charset ?? 'utf-8');
  } catch {
    return new TextDecoder();
  }
}

async function readCapped(response: Response, maxBytes: number, contentType: string): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = decoderFor(contentType);
  let text = '';
  let bytes = 0;
  while (bytes < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = value.subarray(0, maxBytes - bytes);
    bytes += chunk.byteLength;
    text += decoder.decode(chunk, { stream: true });
  }
  await reader.cancel().catch(() => {});
  return text;
}

/** The real implementation, on the runtime's own `fetch`. */
export const fetchHttp: HttpFetch = async ({ url, timeoutMs, maxBytes, headers }) => {
  const response = await fetch(url, {
    redirect: 'manual',
    signal: AbortSignal.timeout(timeoutMs),
    headers: { ...DEFAULT_HEADERS, ...headers },
  });
  const responseHeaders: Record<string, string> = {};
  response.headers.forEach((value, name) => {
    responseHeaders[name.toLowerCase()] = value;
  });
  const contentType = responseHeaders['content-type'] ?? '';
  if (response.ok && (contentType === '' || TEXT_TYPE.test(contentType))) {
    return { status: response.status, headers: responseHeaders, body: await readCapped(response, maxBytes, contentType) };
  }
  await response.body?.cancel().catch(() => {});
  return { status: response.status, headers: responseHeaders, body: '' };
};
