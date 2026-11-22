# ADR 0004: Link resolution and resources

- Status: accepted
- Date: 2026-11-21

## Context

Magpie keeps no comments in its code. The decisions below used to be comments next to the code they explain. Each one records something the code cannot say by itself: why it was done this way, a rule from an outside system, or an invariant that must hold. Each entry names the file and the symbol it applies to, and links to where the comment last appeared, at commit `7ec16b3`.

When the code changes, update or remove the entry here in the same commit.

## Decisions

### `packages/engine/src/config.ts`

#### 0004.1 `LINKS.retryBaseGapMs`

Gap before retry n is retryBaseGapMs × 2^(n-1), so 6 h, 12 h, 24 h.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/config.ts#L52)

#### 0004.2 `LINKS.sharedHosts`

Hosts that serve many unrelated projects, so never aliased to one repo.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/config.ts#L58)

### `packages/engine/src/links/github.ts`

#### 0004.3 `homepageHost`

The host a declared homepage puts forward, and whether it may stand for the repo: only a site root on a host that is not shared between projects.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/links/github.ts#L57-L60)

### `packages/engine/src/links/http.ts`

#### 0004.4 `HttpRequest`

One HTTP request. It never follows a redirect: a 3xx comes back with its `location` header so the caller decides whether to follow. Header names are lowercase. `body` is at most `maxBytes` of a successful text response and empty for anything else. A timeout or network failure rejects.

Given `addresses`, the request connects only to those, never to what the name resolves to at connect time; the name still goes in the `Host` header and TLS server name. `fetchHttp` uses `node:http` and `node:https` for this, since the built-in `fetch` takes no lookup without the `undici` package. It asks for `accept-encoding: identity`, since nothing decompresses the body, and the byte cap counts what is read.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/links/http.ts#L3-L8)

### `packages/engine/src/links/resolve.ts`

#### 0004.5 `plainText`

Page metadata is untrusted: keep plain, single-line, bounded text only.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/links/resolve.ts#L99)

#### 0004.6 `metaContents`

Each tag's end is searched for once, however many tags open before it.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/links/resolve.ts#L111)

#### 0004.7 `metaContents`

A name is only tried from its first character, so a long run with no `=` is read once, not once per character.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/links/resolve.ts#L118)

#### 0004.8 `titleText`

Each step reads the page once from where the last ended, however many titles open and never close.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/links/resolve.ts#L128)

#### 0004.9 `isPublicHost`

Link text comes from strangers, so only addresses on the public web are requested.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/links/resolve.ts#L164)

#### 0004.10 `NON_PUBLIC_ADDRESSES`

Ranges that carry an IPv4 address inside them, which may be a private one.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/links/resolve.ts#L191)

#### 0004.11 `NON_PUBLIC_ADDRESSES`

Used in examples only; nothing real answers there.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/links/resolve.ts#L198)

#### 0004.12 `isPublicAddress`

An IPv4 address written inside an IPv6 one is checked as the IPv4 address.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/links/resolve.ts#L208)

#### 0004.13 `readPackage`

npmjs.com refuses clients that are not browsers, so a package is described by the registry's record of its latest version instead of by its page.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/links/resolve.ts#L216-L219)

#### 0004.14 `readVideo`

A YouTube page served to a client that is not a browser carries no title, so a video is described by YouTube's oEmbed record instead: its title, and its channel as the description.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/links/resolve.ts#L248-L252)

#### 0004.15 `follow`

An address that answers, or that a redirect pointed at, is where the link ends even if its page cannot be read. A shortener's never is.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/links/resolve.ts#L285-L286)

#### 0004.16 `follow`

A public-looking name can resolve to this machine or the local network. The request is pinned to the addresses that passed the check: resolving the name again at connect time would let a DNS answer that changed in between (DNS rebinding) reach a private address. Each redirect hop is looked up and checked again.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/links/resolve.ts#L291)

#### 0004.17 `resolveDue`

Each result is one statement written as soon as it arrives, so a crash or a later failure keeps every link already resolved.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/links/resolve.ts#L362-L363)

#### 0004.18 `resolveDue`

The page was never read, but where the link leads is known: it is filed under that destination, named by its host.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/links/resolve.ts#L390-L391)

#### 0004.19 `assignResources`

Brings every resolved link's resource, and the homepage aliases, in line with what is known now. It recomputes rather than appends, because a repo's homepage is usually learned after the site's own links were filed, and a second repo naming the same host takes an alias away again.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/links/resolve.ts#L427-L432)

#### 0004.20 `assignResources`

A link whose page was read describes the resource ahead of one that only has its host for a title.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/links/resolve.ts#L481)

#### 0004.21 `assignResources`

A repo keeps what GitHub said about it; other kinds follow their first link.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/links/resolve.ts#L496)

#### 0004.22 `resolveLinks`

The link stage of a sync. Follows every new or retry-due link to its final URL, reads the page's title and description, files each resolved link under a resource, and groups a library's site with the repo that declares it as homepage. A link that fails is recorded and retried on a later run; nothing a single link or GitHub does makes the stage throw.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/links/resolve.ts#L558-L564)
