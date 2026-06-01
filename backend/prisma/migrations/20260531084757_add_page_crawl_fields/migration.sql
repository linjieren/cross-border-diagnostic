-- AlterTable
ALTER TABLE "diagnostic_pages" ADD COLUMN     "depth" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "page_type" TEXT,
ADD COLUMN     "weight" DOUBLE PRECISION NOT NULL DEFAULT 1;
