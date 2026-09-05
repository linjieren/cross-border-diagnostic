-- CreateIndex
CREATE INDEX "diagnostic_sessions_user_id_idx" ON "diagnostic_sessions"("user_id");

-- CreateIndex
CREATE INDEX "diagnostic_sessions_status_idx" ON "diagnostic_sessions"("status");

-- CreateIndex
CREATE INDEX "diagnostic_pages_session_id_idx" ON "diagnostic_pages"("session_id");

-- CreateIndex
CREATE INDEX "diagnostic_results_page_id_idx" ON "diagnostic_results"("page_id");

-- CreateIndex
CREATE INDEX "consultant_chats_session_id_idx" ON "consultant_chats"("session_id");

