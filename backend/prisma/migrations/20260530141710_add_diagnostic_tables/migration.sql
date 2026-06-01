-- CreateTable
CREATE TABLE "diagnostic_sessions" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "target_market" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "diagnostic_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diagnostic_pages" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "screenshot_url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "diagnostic_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diagnostic_results" (
    "id" TEXT NOT NULL,
    "page_id" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "score" INTEGER,
    "findings" JSONB,
    "report_data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "diagnostic_results_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "diagnostic_pages" ADD CONSTRAINT "diagnostic_pages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "diagnostic_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagnostic_results" ADD CONSTRAINT "diagnostic_results_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "diagnostic_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
