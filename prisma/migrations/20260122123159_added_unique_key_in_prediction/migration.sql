/*
  Warnings:

  - A unique constraint covering the columns `[state_id,game_id,date]` on the table `predictions` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "predictions_date_idx";

-- DropIndex
DROP INDEX "predictions_game_id_idx";

-- DropIndex
DROP INDEX "predictions_state_id_game_id_date_idx";

-- DropIndex
DROP INDEX "predictions_state_id_idx";

-- CreateIndex
CREATE UNIQUE INDEX "predictions_state_id_game_id_date_key" ON "predictions"("state_id", "game_id", "date");
