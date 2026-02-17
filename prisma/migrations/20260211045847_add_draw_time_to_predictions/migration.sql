/*
  Warnings:

  - Added the required column `draw_time` to the `predictions` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "predictions" ADD COLUMN     "draw_time" "DrawTime" NOT NULL;

-- CreateIndex
CREATE INDEX "predictions_state_id_date_draw_time_idx" ON "predictions"("state_id", "date", "draw_time");
