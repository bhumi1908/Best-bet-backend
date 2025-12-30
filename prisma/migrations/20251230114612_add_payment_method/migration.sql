/*
  Warnings:

  - Made the column `paymentMethod` on table `payments` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "payments" ALTER COLUMN "paymentMethod" SET NOT NULL;
