-- AlterTable
ALTER TABLE "diagnostic_sessions" ADD COLUMN     "agent_steps" JSONB,
ADD COLUMN     "report_html" TEXT,
ADD COLUMN     "report_markdown" TEXT;

-- CreateTable
CREATE TABLE "consultant_chats" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "intent" TEXT,
    "quoted_text" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consultant_chats_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "consultant_chats" ADD CONSTRAINT "consultant_chats_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "diagnostic_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
