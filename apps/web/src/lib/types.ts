export type Band = "confident" | "unsure";

export type Membership = { topicId: number; band: Band };

export type Media = { type: string; url: string };

export type QuotedPost = {
  id: string | null;
  text: string;
  createdAt: string | null;
  authorHandle: string | null;
  authorName: string | null;
  authorAvatarUrl: string | null;
  authorAvatarHue: number | null;
  media: Media[];
};

export type Post = {
  id: string;
  text: string;
  createdAt: string | null;
  /** `createdAt` as epoch milliseconds; null when missing or unreadable. */
  createdAtMs: number | null;
  url: string;
  authorHandle: string;
  authorName: string;
  authorAvatarUrl: string | null;
  authorAvatarHue: number | null;
  likeCount: number;
  quoted: QuotedPost | null;
  media: Media[];
  bookmarked: boolean;
  liked: boolean;
  /** Titles of the pages this post links to, for keyword search. */
  linkTitles: string[];
  /** Best match is in a hidden area or topic and no visible topic matches confidently. */
  hidden: boolean;
  /** No confident match in any topic. */
  unfiled: boolean;
  /** Still waiting on a score or a link, so its topics may change. */
  pending: boolean;
  /** Topics the post is in, confident first, strongest first within a band. */
  memberships: Membership[];
};

/** A post the user removed from the corpus: enough to recognise it and put it back. */
export type RemovedPost = {
  id: string;
  text: string;
  createdAt: string | null;
  url: string;
  authorHandle: string;
  authorName: string;
  authorAvatarUrl: string | null;
  bookmarked: boolean;
  liked: boolean;
  removedAt: string;
};

export type Area = {
  id: number;
  name: string;
  /** "auto", or "system" for the built-in area that holds pinned searches. */
  kind: string;
  hidden: boolean;
  locked: boolean;
  /** Distinct posts in any topic of the area, confident or unsure. */
  postCount: number;
};

export type Topic = {
  id: number;
  areaId: number | null;
  name: string;
  definition: string;
  /** "auto", or "pinned" for a kept free-text search. */
  kind: string;
  /** Hidden itself or through its area. */
  hidden: boolean;
  /** The topic's own hidden flag, whatever its area says. */
  hiddenSelf: boolean;
  locked: boolean;
  /** Posts in the topic, confident or unsure. */
  postCount: number;
  confidentCount: number;
};

export type Resource = {
  id: number;
  /** "repo" | "package" | "video" | "page" */
  kind: string;
  url: string;
  host: string | null;
  title: string | null;
  /** Visible posts that link to it. */
  postIds: string[];
};

export type Change = {
  id: number;
  /** "initial" | "new_topic" | "split" | "undo" */
  kind: string;
  /** "auto" | "user" */
  source: string;
  summary: string;
  postCount: number;
  createdAt: string;
  /** An automatic change that can still be undone. */
  undoable: boolean;
  undoneAt: string | null;
};

export type RunStage = {
  stage: string;
  outcome: string;
  message: string | null;
  counts: Record<string, number>;
};

export type Run = {
  id: number;
  startedAt: string;
  finishedAt: string | null;
  /** "running" | "complete" | "failed" */
  status: string;
  /** Whether the X export this run read was fresh: "ok" | "failed" | "unknown". */
  upstreamSync: string;
  upstreamSyncDetail: string | null;
  message: string | null;
  stages: RunStage[];
};

export type Snapshot = {
  /** False when no store file exists yet, so nothing has ever synced. */
  storeExists: boolean;
  /** Every post currently bookmarked or liked that the user has not removed. */
  posts: Post[];
  /** Posts still bookmarked or liked that the user removed, most recently removed first. Nothing else counts them. */
  removed: RemovedPost[];
  areas: Area[];
  topics: Topic[];
  resources: Resource[];
  /** Newest first. */
  changes: Change[];
  lastRun: Run | null;
  /** When the most recent run that completed finished. */
  lastCompleteRunAt: string | null;
};

export type Collection = "everything" | "bookmarks" | "likes";
export type TimeRange = "all" | "week" | "month" | "year";
export type Sort = "newest" | "oldest" | "most_liked";

export type FilterState = {
  collection: Collection;
  topicIds: number[];
  areaIds: number[];
  unfiled: boolean;
  /** An author handle, without the @. */
  author: string | null;
  keyword: string;
  timeRange: TimeRange;
  sort: Sort;
  mediaOnly: boolean;
  revealHidden: boolean;
};

export type FilterResult = {
  /** The state actually applied, after dropping what the snapshot no longer has. */
  state: FilterState;
  /** Selected ids that no longer exist in the snapshot. */
  dropped: { topicIds: number[]; areaIds: number[] };
  /** Matching posts, in display order. */
  posts: Post[];
  /**
   * Under a topic or area selection, the index of the first post that is only
   * an unsure match; `posts.length` when every match is confident. Null when
   * no topic or area is selected.
   */
  unsureStart: number | null;
};

export type Stats = { posts: number; bookmarks: number; likes: number; authors: number };

export type AuthorCount = {
  handle: string;
  name: string;
  avatarUrl: string | null;
  avatarHue: number | null;
  count: number;
};

export type Chip = { topicId: number; possible: boolean };

/** A half-open range of string indexes: [start, end). */
export type Range = [start: number, end: number];

export type ResourceGroup = { resource: Resource; posts: Post[] };

export type ActionErrorCode =
  | "unknown_topic"
  | "unknown_area"
  | "unknown_post"
  | "unknown_change"
  | "not_active"
  | "invalid_name"
  | "invalid_score"
  | "merge_into_self"
  | "not_pinned"
  | "system_area"
  | "not_undoable"
  | "already_undone"
  | "invalid_input"
  | "no_store"
  | "failed";

export type ActionResult<T> = ({ ok: true } & T) | { ok: false; code: ActionErrorCode; message: string };

export type UndoStep = { id: number; kind: string; summary: string; postCount: number; createdAt: string };
