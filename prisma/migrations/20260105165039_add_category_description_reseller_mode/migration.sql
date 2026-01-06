/*
  Warnings:

  - You are about to drop the column `is_fixed_amount` on the `categories` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "categories" DROP COLUMN "is_fixed_amount",
ADD COLUMN     "description" VARCHAR(500),
ADD COLUMN     "is_reseller_percentage" BOOLEAN NOT NULL DEFAULT true,
ALTER COLUMN "markup_retail" SET DEFAULT 50;
