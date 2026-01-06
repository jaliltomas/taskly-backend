-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "is_retail_percentage" BOOLEAN NOT NULL DEFAULT true,
ALTER COLUMN "markup_retail" SET DEFAULT 0.15;
