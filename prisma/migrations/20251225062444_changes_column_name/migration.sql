/*
  Warnings:

  - The primary key for the `features` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `feature_id` on the `features` table. All the data in the column will be lost.
  - You are about to drop the column `plan_id` on the `features` table. All the data in the column will be lost.
  - The primary key for the `payments` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `payment_id` on the `payments` table. All the data in the column will be lost.
  - You are about to drop the column `user_id` on the `payments` table. All the data in the column will be lost.
  - The primary key for the `refunds` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `payment_id` on the `refunds` table. All the data in the column will be lost.
  - You are about to drop the column `refund_id` on the `refunds` table. All the data in the column will be lost.
  - You are about to drop the column `user_id` on the `refunds` table. All the data in the column will be lost.
  - The primary key for the `subscription_plans` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `plan_id` on the `subscription_plans` table. All the data in the column will be lost.
  - You are about to drop the column `payment_id` on the `user_subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `plan_id` on the `user_subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `user_id` on the `user_subscriptions` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[paymentId]` on the table `refunds` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `planId` to the `features` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `payments` table without a default value. This is not possible if the table is not empty.
  - Added the required column `paymentId` to the `refunds` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `refunds` table without a default value. This is not possible if the table is not empty.
  - Added the required column `planId` to the `user_subscriptions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `user_subscriptions` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "features" DROP CONSTRAINT "features_plan_id_fkey";

-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_user_id_fkey";

-- DropForeignKey
ALTER TABLE "refunds" DROP CONSTRAINT "refunds_payment_id_fkey";

-- DropForeignKey
ALTER TABLE "refunds" DROP CONSTRAINT "refunds_user_id_fkey";

-- DropForeignKey
ALTER TABLE "user_subscriptions" DROP CONSTRAINT "user_subscriptions_payment_id_fkey";

-- DropForeignKey
ALTER TABLE "user_subscriptions" DROP CONSTRAINT "user_subscriptions_plan_id_fkey";

-- DropForeignKey
ALTER TABLE "user_subscriptions" DROP CONSTRAINT "user_subscriptions_user_id_fkey";

-- DropIndex
DROP INDEX "refunds_payment_id_key";

-- AlterTable
ALTER TABLE "features" DROP CONSTRAINT "features_pkey",
DROP COLUMN "feature_id",
DROP COLUMN "plan_id",
ADD COLUMN     "id" SERIAL NOT NULL,
ADD COLUMN     "planId" INTEGER NOT NULL,
ADD CONSTRAINT "features_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "payments" DROP CONSTRAINT "payments_pkey",
DROP COLUMN "payment_id",
DROP COLUMN "user_id",
ADD COLUMN     "id" SERIAL NOT NULL,
ADD COLUMN     "userId" INTEGER NOT NULL,
ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "refunds" DROP CONSTRAINT "refunds_pkey",
DROP COLUMN "payment_id",
DROP COLUMN "refund_id",
DROP COLUMN "user_id",
ADD COLUMN     "id" SERIAL NOT NULL,
ADD COLUMN     "paymentId" INTEGER NOT NULL,
ADD COLUMN     "userId" INTEGER NOT NULL,
ADD CONSTRAINT "refunds_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "subscription_plans" DROP CONSTRAINT "subscription_plans_pkey",
DROP COLUMN "plan_id",
ADD COLUMN     "id" SERIAL NOT NULL,
ADD CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "user_subscriptions" DROP COLUMN "payment_id",
DROP COLUMN "plan_id",
DROP COLUMN "user_id",
ADD COLUMN     "paymentId" INTEGER,
ADD COLUMN     "planId" INTEGER NOT NULL,
ADD COLUMN     "userId" INTEGER NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "refunds_paymentId_key" ON "refunds"("paymentId");

-- AddForeignKey
ALTER TABLE "features" ADD CONSTRAINT "features_planId_fkey" FOREIGN KEY ("planId") REFERENCES "subscription_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_subscriptions" ADD CONSTRAINT "user_subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_subscriptions" ADD CONSTRAINT "user_subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_subscriptions" ADD CONSTRAINT "user_subscriptions_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
