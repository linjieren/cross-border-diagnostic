-- CreateTable
CREATE TABLE IF NOT EXISTS "feedbacks" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "screenshots" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "fingerprint" TEXT,
    "version" TEXT,
    "page" TEXT,
    "userAgent" TEXT,
    "submitted_at" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'new',
    "category" TEXT,
    "priority" TEXT,
    "duplicate_of" TEXT,
    "notes" TEXT,
    "evaluated_at" TIMESTAMP(3),
    "requirement_id" TEXT,
    "dev_task_id" TEXT,
    "assigned_to" TEXT,
    "verified_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feedbacks_pkey" PRIMARY KEY ("id")
);
