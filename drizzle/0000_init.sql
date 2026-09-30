CREATE TABLE "assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"evaluator_id" uuid NOT NULL,
	"counterpart_id" uuid NOT NULL,
	"dimensions" jsonb NOT NULL,
	"summary" text NOT NULL,
	"strongest_connection" text NOT NULL,
	"concern" text NOT NULL,
	"second_date" text NOT NULL,
	"score" real,
	"raw" real,
	"coverage" real NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "date_turns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date_id" uuid NOT NULL,
	"turn_index" integer NOT NULL,
	"actor_person_id" uuid NOT NULL,
	"act" text NOT NULL,
	"action" text NOT NULL,
	"utterance" text NOT NULL,
	"evidence_ids" jsonb NOT NULL,
	"reacting_to" text,
	"plan_title" text,
	"plan_details" text,
	"explanation" text NOT NULL,
	"model" text NOT NULL,
	"latency_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"person_a_id" uuid NOT NULL,
	"person_b_id" uuid NOT NULL,
	"profile_a_id" uuid NOT NULL,
	"profile_b_id" uuid NOT NULL,
	"first_speaker" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"lease_until" timestamp with time zone,
	"scenario_version" text NOT NULL,
	"prompt_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"run_id" uuid,
	"date_id" uuid,
	"person_id" uuid,
	"type" text NOT NULL,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence" (
	"id" text PRIMARY KEY NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"local_id" text NOT NULL,
	"platform" text NOT NULL,
	"field" text NOT NULL,
	"label" text NOT NULL,
	"excerpt" text NOT NULL,
	"url" text NOT NULL,
	"published_at" timestamp with time zone,
	"collected_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_usage" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"ref_id" text,
	"model" text NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"thinking_tokens" integer,
	"latency_ms" integer,
	"attempt" integer DEFAULT 1 NOT NULL,
	"ok" boolean NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"display_name" text,
	"linkedin_url" text NOT NULL,
	"instagram_url" text NOT NULL,
	"linkedin_slug" text NOT NULL,
	"instagram_handle" text NOT NULL,
	"origin" text NOT NULL,
	"status" text DEFAULT 'submitted' NOT NULL,
	"status_detail" text,
	"identity" jsonb,
	"public_state" jsonb,
	"identity_attested" boolean DEFAULT false NOT NULL,
	"current_profile_id" uuid,
	"created_by_session" uuid,
	"submission_key" text,
	"lease_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "people_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "profile_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"linkedin_snapshot_id" uuid NOT NULL,
	"instagram_snapshot_id" uuid NOT NULL,
	"profile" jsonb NOT NULL,
	"agent_card" jsonb NOT NULL,
	"public_intro" jsonb NOT NULL,
	"coverage" jsonb NOT NULL,
	"quality" text NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "run_members" (
	"run_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"profile_version_id" uuid NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "run_members_run_id_person_id_pk" PRIMARY KEY("run_id","person_id")
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"owner_session_id" uuid,
	"focus_person_id" uuid,
	"base_run_id" uuid,
	"status" text DEFAULT 'running' NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"expected_pairs" integer NOT NULL,
	"scenario_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	CONSTRAINT "runs_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "source_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"provider" text NOT NULL,
	"provider_run_id" text,
	"provider_dataset_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"raw_payload" jsonb,
	"normalized" jsonb,
	"coverage" jsonb,
	"content_hash" text,
	"started_at" timestamp with time zone,
	"fetched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_date_id_dates_id_fk" FOREIGN KEY ("date_id") REFERENCES "public"."dates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "date_turns" ADD CONSTRAINT "date_turns_date_id_dates_id_fk" FOREIGN KEY ("date_id") REFERENCES "public"."dates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dates" ADD CONSTRAINT "dates_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dates" ADD CONSTRAINT "dates_person_a_id_people_id_fk" FOREIGN KEY ("person_a_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dates" ADD CONSTRAINT "dates_person_b_id_people_id_fk" FOREIGN KEY ("person_b_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_snapshot_id_source_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."source_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_versions" ADD CONSTRAINT "profile_versions_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_members" ADD CONSTRAINT "run_members_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_members" ADD CONSTRAINT "run_members_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_snapshots" ADD CONSTRAINT "source_snapshots_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assessment_date_evaluator_uq" ON "assessments" USING btree ("date_id","evaluator_id");--> statement-breakpoint
CREATE INDEX "assessment_run_evaluator_idx" ON "assessments" USING btree ("run_id","evaluator_id");--> statement-breakpoint
CREATE UNIQUE INDEX "turn_date_index_uq" ON "date_turns" USING btree ("date_id","turn_index");--> statement-breakpoint
CREATE UNIQUE INDEX "dates_run_pair_uq" ON "dates" USING btree ("run_id","person_a_id","person_b_id");--> statement-breakpoint
CREATE INDEX "dates_run_status_idx" ON "dates" USING btree ("run_id","status");--> statement-breakpoint
CREATE INDEX "events_run_idx" ON "events" USING btree ("run_id","id");--> statement-breakpoint
CREATE INDEX "events_person_idx" ON "events" USING btree ("person_id","id");--> statement-breakpoint
CREATE INDEX "evidence_snapshot_idx" ON "evidence" USING btree ("snapshot_id");--> statement-breakpoint
CREATE INDEX "llm_usage_created_idx" ON "llm_usage" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "people_pair_uq" ON "people" USING btree ("linkedin_url","instagram_url");--> statement-breakpoint
CREATE INDEX "people_session_idx" ON "people" USING btree ("created_by_session","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "profile_person_version_uq" ON "profile_versions" USING btree ("person_id","version");--> statement-breakpoint
CREATE INDEX "snap_person_idx" ON "source_snapshots" USING btree ("person_id","platform","created_at");