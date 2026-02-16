-- AlterTable
ALTER TABLE "predictions" ADD COLUMN     "draw_time" "DrawTime";

-- CreateIndex
CREATE INDEX "predictions_state_id_date_draw_time_idx" ON "predictions"("state_id", "date", "draw_time");
