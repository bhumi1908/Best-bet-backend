-- AlterTable
ALTER TABLE "subscription_plans" ADD COLUMN     "trialDays" INTEGER,
ALTER COLUMN "duration" DROP NOT NULL;
