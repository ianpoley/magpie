import { request as httpRequest } from 'node:http';
import type { IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import type { LookupFunction } from 'node:net';
import { TextDecoder } from 'node:util';

export type HttpRequest = {
  url: string;
  timeoutMs: number;
  maxBytes: number;
  headers?: Record<string, string>;
  addresses?: string[];
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
  'accept-encoding': 'identity',
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

async function readCapped(response: IncomingMessage, maxBytes: number, contentType: string): Promise<string> {
  const decoder = decoderFor(contentType);
  let text = '';
  let bytes = 0;
  for await (const value of response as AsyncIterable<Buffer>) {
    const chunk = value.subarray(0, maxBytes - bytes);
    bytes += chunk.byteLength;
    text += decoder.decode(chunk, { stream: true });
    if (bytes >= maxBytes) break;
  }
  response.destroy();
  return text;
}

function pinnedLookup(addresses: string[]): LookupFunction {
  const found = addresses.map((address) => ({ address, family: isIP(address) }));
  return (_hostname, options, callback) => {
    if (options.all) callback(null, found);
    else callback(null, found[0].address, found[0].family);
  };
}

function send(request: HttpRequest): Promise<IncomingMessage> {
  const url = new URL(request.url);
  const open = url.protocol === 'https:' ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const outgoing = open(
      url,
      {
        agent: false,
        signal: AbortSignal.timeout(request.timeoutMs),
        headers: { ...DEFAULT_HEADERS, ...request.headers },
        lookup: request.addresses?.length ? pinnedLookup(request.addresses) : undefined,
      },
      resolve,
    );
    outgoing.on('error', reject);
    outgoing.end();
  });
}

export const fetchHttp: HttpFetch = async (request) => {
  const response = await send(request);
  const status = response.statusCode ?? 0;
  const responseHeaders: Record<string, string> = {};
  for (const [name, value] of Object.entries(response.headers)) {
    if (value !== undefined) responseHeaders[name.toLowerCase()] = Array.isArray(value) ? value.join(', ') : value;
  }
  const contentType = responseHeaders['content-type'] ?? '';
  if (status >= 200 && status < 300 && (contentType === '' || TEXT_TYPE.test(contentType))) {
    return { status, headers: responseHeaders, body: await readCapped(response, request.maxBytes, contentType) };
  }
  response.destroy();
  return { status, headers: responseHeaders, body: '' };
};
