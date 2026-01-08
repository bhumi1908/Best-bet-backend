/*
  Warnings:

  - The values [MIDDAY,EVENING] on the enum `DrawTime` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "DrawTime_new" AS ENUM ('MID', 'EVE');
ALTER TABLE "game_history" ALTER COLUMN "draw_time" TYPE "DrawTime_new" USING ("draw_time"::text::"DrawTime_new");
ALTER TYPE "DrawTime" RENAME TO "DrawTime_old";
ALTER TYPE "DrawTime_new" RENAME TO "DrawTime";
DROP TYPE "public"."DrawTime_old";
COMMIT;

-- AlterTable
ALTER TABLE "game_history" ADD COLUMN     "prize_amount" DECIMAL(10,2);
