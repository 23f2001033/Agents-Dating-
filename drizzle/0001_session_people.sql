CREATE TABLE "session_people" (
	"session_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_people_session_id_person_id_pk" PRIMARY KEY("session_id","person_id")
);
--> statement-breakpoint
ALTER TABLE "session_people" ADD CONSTRAINT "session_people_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_people" ADD CONSTRAINT "session_people_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;