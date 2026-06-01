-- AlterTable
ALTER TABLE "feedbacks" ADD COLUMN     "duplicate_group_id" TEXT,
ALTER COLUMN "screenshots" DROP DEFAULT;
