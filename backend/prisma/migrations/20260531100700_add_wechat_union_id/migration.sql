-- AlterTable
ALTER TABLE "users" ADD COLUMN "wechat_unionid" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_wechat_unionid_key" ON "users"("wechat_unionid");
