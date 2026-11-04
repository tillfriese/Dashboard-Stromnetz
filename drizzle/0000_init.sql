CREATE TYPE "public"."backfill_status" AS ENUM('pending', 'running', 'paused', 'cancelled', 'done', 'error');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('running', 'success', 'error');--> statement-breakpoint
CREATE TYPE "public"."series_kind" AS ENUM('actual', 'forecast');--> statement-breakpoint
CREATE TABLE "backfill_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sources" text[] NOT NULL,
	"range_from" date NOT NULL,
	"range_to" date NOT NULL,
	"status" "backfill_status" DEFAULT 'pending' NOT NULL,
	"progress" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"current_chunk" text,
	"rows" bigint DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ingest_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"job" text DEFAULT 'scheduled' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" "run_status" DEFAULT 'running' NOT NULL,
	"rows" integer DEFAULT 0 NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "observations" (
	"series_id" integer NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"value" double precision NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "observations_series_id_ts_pk" PRIMARY KEY("series_id","ts")
);
--> statement-breakpoint
CREATE TABLE "saved_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"query" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "series" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"source" text NOT NULL,
	"region" text NOT NULL,
	"unit" text NOT NULL,
	"label" text NOT NULL,
	"color" text,
	"kind" "series_kind" DEFAULT 'actual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "series_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value_encrypted" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "visit_events" (
	"ts" timestamp with time zone NOT NULL,
	"visit_id" text NOT NULL,
	"type" text NOT NULL,
	"path" text NOT NULL,
	"name" text,
	"value" double precision,
	"props" jsonb
);
--> statement-breakpoint
CREATE TABLE "visits" (
	"id" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"pageviews" smallint DEFAULT 0 NOT NULL,
	"entry_path" text,
	"exit_path" text,
	"referrer_domain" text,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"utm_term" text,
	"utm_content" text,
	"country" text,
	"device" text,
	"browser" text,
	"browser_version" text,
	"os" text,
	"os_version" text,
	"screen_class" text,
	"language" text,
	"timezone" text,
	"color_scheme" text,
	CONSTRAINT "visits_id_started_at_pk" PRIMARY KEY("id","started_at")
);
--> statement-breakpoint
ALTER TABLE "observations" ADD CONSTRAINT "observations_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ingest_runs_source_started_idx" ON "ingest_runs" USING btree ("source","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "visit_events_visit_ts_idx" ON "visit_events" USING btree ("visit_id","ts");