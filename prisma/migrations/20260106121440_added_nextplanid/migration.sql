-- AlterTable
ALTER TABLE "user_subscriptions" ADD COLUMN     "nextPlanId" INTEGER,
ADD COLUMN     "scheduledChangeAt" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "user_subscriptions" ADD CONSTRAINT "user_subscriptions_nextPlanId_fkey" FOREIGN KEY ("nextPlanId") REFERENCES "subscription_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
