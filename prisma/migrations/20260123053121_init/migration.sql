-- DropIndex
DROP INDEX "predictions_state_id_game_id_date_key";

-- CreateIndex
CREATE INDEX "predictions_state_id_game_id_idx" ON "predictions"("state_id", "game_id");
