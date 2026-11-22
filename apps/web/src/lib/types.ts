import type { ResourceKind } from "@magpie/engine/src/links/canonical.ts";
import type { UpstreamSync } from "@magpie/engine/src/pipeline.ts";

export type { ResourceKind, UpstreamSync };

export type Band = "confident" | "unsure";

export type Membership = { topicId: number; band: Band };

export type Media = { type: string; url: string };

export type PlayableMedia = { thumbUrl: string; videoUrl: string; kind: "video" | "gif"; durationMs: number | null };

export type LinkedPage = { url: string | null; title: string; host: string | null };

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
  createdAtMs: number | null;
  addedAtMs: number | null;
  url: string;
  authorHandle: string;
  authorName: string;
  authorAvatarUrl: string | null;
  authorAvatarHue: number | null;
  likeCount: number;
  replyToId: string | null;
  quoted: QuotedPost | null;
  media: Media[];
  bookmarked: boolean;
  liked: boolean;
  linkedPages: LinkedPage[];
  hidden: boolean;
  unfiled: boolean;
  pending: boolean;
  memberships: Membership[];
};

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

export type AreaKind = "auto" | "system";
export type TopicKind = "auto" | "pinned";
export type ChangeKind = "initial" | "new_topic" | "split" | "undo";
export type ChangeSource = "auto" | "user";
export type RunStatus = "running" | "complete" | "failed";

export type Area = {
  id: number;
  name: string;
  kind: AreaKind;
  hidden: boolean;
  locked: boolean;
  postCount: number;
};

export type Topic = {
  id: number;
  areaId: number | null;
  name: string;
  definition: string;
  kind: TopicKind;
  hidden: boolean;
  hiddenSelf: boolean;
  locked: boolean;
  postCount: number;
  confidentCount: number;
};

export type Resource = {
  id: number;
  kind: ResourceKind;
  url: string;
  host: string | null;
  title: string | null;
  description: string | null;
  postIds: string[];
};

export type Change = {
  id: number;
  kind: ChangeKind;
  source: ChangeSource;
  summary: string;
  postCount: number;
  createdAt: string;
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
  status: RunStatus;
  upstreamSync: UpstreamSync;
  upstreamSyncDetail: string | null;
  message: string | null;
  stages: RunStage[];
};

export type Snapshot = {
  storeExists: boolean;
  posts: Post[];
  removed: RemovedPost[];
  areas: Area[];
  topics: Topic[];
  resources: Resource[];
  changes: Change[];
  lastRun: Run | null;
  lastCompleteRunAt: string | null;
};

export type SyncState = {
  readAt: number;
  connection: "connected" | "needs_reconnect" | "not_connected";
  handle: string | null;
  secretBackend: "keychain" | "file" | null;
  secretStoreLocked: boolean;
  running: boolean;
  requested: boolean;
  workerAlive: boolean;
  nextRunAt: string | null;
  storeExists: boolean;
  lastRun: Run | null;
  lastCompleteRunAt: string | null;
};

export type Collection = "everything" | "bookmarks" | "likes";
export type TimeRange = "all" | "week" | "month" | "year";
export type Sort = "newest" | "added" | "oldest" | "most_liked";

export type FilterState = {
  collection: Collection;
  topicIds: number[];
  areaIds: number[];
  unfiled: boolean;
  author: string | null;
  keyword: string;
  timeRange: TimeRange;
  sort: Sort;
  mediaOnly: boolean;
  revealHidden: boolean;
};

export type FilterResult = {
  state: FilterState;
  dropped: { topicIds: number[]; areaIds: number[] };
  posts: Post[];
  unsureStart: number | null;
};

export type AuthorCount = {
  handle: string;
  name: string;
  avatarUrl: string | null;
  avatarHue: number | null;
  count: number;
};

export type Chip = { topicId: number; possible: boolean };

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
  | "pinned_target"
  | "not_pinned"
  | "system_area"
  | "not_undoable"
  | "already_undone"
  | "purged"
  | "invalid_input"
  | "no_store"
  | "x_rejected"
  | "x_unreachable"
  | "jev_rejected"
  | "jev_unreachable"
  | "not_connected"
  | "run_in_progress"
  | "no_worker"
  | "secret_store_locked"
  | "resort_failed"
  | "failed";

export type ActionResult<T> = ({ ok: true } & T) | { ok: false; code: ActionErrorCode; message: string };

export type FocusMode = "all" | "focus";

export type FocusState = { mode: FocusMode; focus: string; chosen: boolean };

export type ResortArea = { id: number; name: string };

export type ResortPreview = { toHide: ResortArea[]; toShow: ResortArea[] };

export type ResortChoice = { toHide: Pick<ResortArea, "id">[]; toShow: Pick<ResortArea, "id">[] };

export type SkillLink = "linked" | "elsewhere" | "missing" | "none";

export type SettingsState = { focus: FocusState; skillLink: SkillLink; jevKeyStored: boolean };

export type UndoStep = {
  id: number;
  kind: string;
  summary: string;
  postCount: number;
  createdAt: string;
  restores: string[];
};
