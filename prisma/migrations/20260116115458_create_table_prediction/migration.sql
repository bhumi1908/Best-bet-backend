-- CreateTable
CREATE TABLE "predictions" (
    "id" SERIAL NOT NULL,
    "date" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "game_id" INTEGER NOT NULL,
    "state_id" INTEGER NOT NULL,
    "predictions" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "predictions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "predictions_state_id_idx" ON "predictions"("state_id");

-- CreateIndex
CREATE INDEX "predictions_game_id_idx" ON "predictions"("game_id");

-- CreateIndex
CREATE INDEX "predictions_date_idx" ON "predictions"("date");

-- CreateIndex
CREATE INDEX "predictions_state_id_game_id_date_idx" ON "predictions"("state_id", "game_id", "date");

-- AddForeignKey
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_state_id_fkey" FOREIGN KEY ("state_id") REFERENCES "states"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
