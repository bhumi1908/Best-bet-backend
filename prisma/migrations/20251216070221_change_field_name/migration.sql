/*
  Warnings:

  - You are about to drop the column `is_deleted` on the `users` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "users" DROP COLUMN "is_deleted",
ADD COLUMN     "is_inactive" BOOLEAN NOT NULL DEFAULT false;
