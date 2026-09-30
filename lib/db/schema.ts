import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true });

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tokenHash: text("token_hash").notNull().unique(),
  ipHash: text("ip_hash"),
  createdAt: ts("created_at").notNull().defaultNow(),
  expiresAt: ts("expires_at").notNull(),
});

// A person is one LinkedIn + one Instagram account pair.
// status: submitted → collecting → verifying → analyzing → ready
//         (terminal/recoverable: blocked_private, blocked_identity, insufficient_data, failed)
export const people = pgTable(
  "people",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    displayName: text("display_name"),
    linkedinUrl: text("linkedin_url").notNull(),
    instagramUrl: text("instagram_url").notNull(),
    linkedinSlug: text("linkedin_slug").notNull(),
    instagramHandle: text("instagram_handle").notNull(),
    origin: text("origin").notNull(), // 'seed' | 'visitor'
    status: text("status").notNull().default("submitted"),
    statusDetail: text("status_detail"),
    identity: jsonb("identity"),
    publicState: jsonb("public_state"),
    identityAttested: boolean("identity_attested").notNull().default(false),
    currentProfileId: uuid("current_profile_id"),
    createdBySession: uuid("created_by_session"),
    submissionKey: text("submission_key"),
    leaseUntil: ts("lease_until"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("people_pair_uq").on(t.linkedinUrl, t.instagramUrl),
    index("people_session_idx").on(t.createdBySession, t.createdAt),
  ],
);

// One provider collection per platform per attempt. rawPayload is private and never served.
export const sourceSnapshots = pgTable(
  "source_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(), // 'linkedin' | 'instagram'
    provider: text("provider").notNull(),
    providerRunId: text("provider_run_id"),
    providerDatasetId: text("provider_dataset_id"),
    status: text("status").notNull().default("pending"), // pending|running|succeeded|failed
    attempts: integer("attempts").notNull().default(0),
    error: text("error"),
    rawPayload: jsonb("raw_payload"),
    normalized: jsonb("normalized"),
    coverage: jsonb("coverage"),
    contentHash: text("content_hash"),
    startedAt: ts("started_at"),
    fetchedAt: ts("fetched_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("snap_person_idx").on(t.personId, t.platform, t.createdAt)],
);

// Immutable evidence items. id = `${snapshotId}:${localId}`; localId like L3 / I7.
export const evidence = pgTable(
  "evidence",
  {
    id: text("id").primaryKey(),
    snapshotId: uuid("snapshot_id")
      .notNull()
      .references(() => sourceSnapshots.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    localId: text("local_id").notNull(),
    platform: text("platform").notNull(),
    field: text("field").notNull(),
    label: text("label").notNull(),
    excerpt: text("excerpt").notNull(),
    url: text("url").notNull(),
    publishedAt: ts("published_at"),
    collectedAt: ts("collected_at").notNull(),
  },
  (t) => [index("evidence_snapshot_idx").on(t.snapshotId)],
);

export const profileVersions = pgTable(
  "profile_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    linkedinSnapshotId: uuid("linkedin_snapshot_id").notNull(),
    instagramSnapshotId: uuid("instagram_snapshot_id").notNull(),
    profile: jsonb("profile").notNull(),
    agentCard: jsonb("agent_card").notNull(),
    publicIntro: jsonb("public_intro").notNull(),
    coverage: jsonb("coverage").notNull(),
    quality: text("quality").notNull(), // 'two_source' | 'limited'
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("profile_person_version_uq").on(t.personId, t.version)],
);

// status: preparing → ready → running → completed (| partial)
export const runs = pgTable("runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  kind: text("kind").notNull(), // 'demo' | 'visitor'
  title: text("title").notNull(),
  ownerSessionId: uuid("owner_session_id"),
  focusPersonId: uuid("focus_person_id"),
  baseRunId: uuid("base_run_id"),
  status: text("status").notNull().default("running"),
  published: boolean("published").notNull().default(false),
  expectedPairs: integer("expected_pairs").notNull(),
  scenarioVersion: text("scenario_version").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
  completedAt: ts("completed_at"),
  publishedAt: ts("published_at"),
});

export const runMembers = pgTable(
  "run_members",
  {
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    profileVersionId: uuid("profile_version_id").notNull(),
    position: integer("position").notNull(),
  },
  (t) => [primaryKey({ columns: [t.runId, t.personId] })],
);

// status: queued → running → assessing → completed (| retrying | failed)
export const dates = pgTable(
  "dates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    personAId: uuid("person_a_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    personBId: uuid("person_b_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    profileAId: uuid("profile_a_id").notNull(),
    profileBId: uuid("profile_b_id").notNull(),
    firstSpeaker: text("first_speaker").notNull(), // 'a' | 'b'
    status: text("status").notNull().default("queued"),
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    leaseUntil: ts("lease_until"),
    scenarioVersion: text("scenario_version").notNull(),
    promptVersion: text("prompt_version").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
    startedAt: ts("started_at"),
    completedAt: ts("completed_at"),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("dates_run_pair_uq").on(t.runId, t.personAId, t.personBId),
    index("dates_run_status_idx").on(t.runId, t.status),
  ],
);

export const dateTurns = pgTable(
  "date_turns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dateId: uuid("date_id")
      .notNull()
      .references(() => dates.id, { onDelete: "cascade" }),
    turnIndex: integer("turn_index").notNull(),
    actorPersonId: uuid("actor_person_id").notNull(),
    act: text("act").notNull(),
    action: text("action").notNull(),
    utterance: text("utterance").notNull(),
    evidenceIds: jsonb("evidence_ids").notNull(),
    reactingTo: text("reacting_to"),
    planTitle: text("plan_title"),
    planDetails: text("plan_details"),
    explanation: text("explanation").notNull(),
    model: text("model").notNull(),
    latencyMs: integer("latency_ms"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("turn_date_index_uq").on(t.dateId, t.turnIndex)],
);

export const assessments = pgTable(
  "assessments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dateId: uuid("date_id")
      .notNull()
      .references(() => dates.id, { onDelete: "cascade" }),
    runId: uuid("run_id").notNull(),
    evaluatorId: uuid("evaluator_id").notNull(),
    counterpartId: uuid("counterpart_id").notNull(),
    dimensions: jsonb("dimensions").notNull(),
    summary: text("summary").notNull(),
    strongestConnection: text("strongest_connection").notNull(),
    concern: text("concern").notNull(),
    secondDate: text("second_date").notNull(),
    score: real("score"),
    raw: real("raw"),
    coverage: real("coverage").notNull(),
    model: text("model").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("assessment_date_evaluator_uq").on(t.dateId, t.evaluatorId),
    index("assessment_run_evaluator_idx").on(t.runId, t.evaluatorId),
  ],
);

export const events = pgTable(
  "events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    runId: uuid("run_id"),
    dateId: uuid("date_id"),
    personId: uuid("person_id"),
    type: text("type").notNull(),
    payload: jsonb("payload"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("events_run_idx").on(t.runId, t.id),
    index("events_person_idx").on(t.personId, t.id),
  ],
);

export const llmUsage = pgTable(
  "llm_usage",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    kind: text("kind").notNull(),
    refId: text("ref_id"),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    thinkingTokens: integer("thinking_tokens"),
    latencyMs: integer("latency_ms"),
    attempt: integer("attempt").notNull().default(1),
    ok: boolean("ok").notNull(),
    error: text("error"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("llm_usage_created_idx").on(t.createdAt)],
);

// Access grants: which anonymous session may view/drive which unpublished person.
export const sessionPeople = pgTable(
  "session_people",
  {
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.personId] })],
);
