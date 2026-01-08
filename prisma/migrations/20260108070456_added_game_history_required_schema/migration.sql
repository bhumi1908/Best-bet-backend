-- CreateEnum
CREATE TYPE "DrawTime" AS ENUM ('MIDDAY', 'EVENING');

-- CreateEnum
CREATE TYPE "GameResultStatus" AS ENUM ('WIN', 'LOSS', 'PENDING');

-- CreateTable
CREATE TABLE "states" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_types" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "game_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_history" (
    "id" SERIAL NOT NULL,
    "state_id" INTEGER NOT NULL,
    "game_type_id" INTEGER NOT NULL,
    "draw_date" TIMESTAMP(3) NOT NULL,
    "draw_time" "DrawTime" NOT NULL,
    "winning_numbers" TEXT NOT NULL,
    "result_status" "GameResultStatus" NOT NULL DEFAULT 'PENDING',
    "total_winners" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "states_name_key" ON "states"("name");

-- CreateIndex
CREATE UNIQUE INDEX "states_code_key" ON "states"("code");

-- CreateIndex
CREATE UNIQUE INDEX "game_types_name_key" ON "game_types"("name");

-- CreateIndex
CREATE UNIQUE INDEX "game_types_code_key" ON "game_types"("code");

-- CreateIndex
CREATE INDEX "game_history_state_id_game_type_id_idx" ON "game_history"("state_id", "game_type_id");

-- CreateIndex
CREATE INDEX "game_history_draw_date_idx" ON "game_history"("draw_date");

-- CreateIndex
CREATE INDEX "game_history_result_status_idx" ON "game_history"("result_status");

-- CreateIndex
CREATE UNIQUE INDEX "game_history_state_id_game_type_id_draw_date_draw_time_key" ON "game_history"("state_id", "game_type_id", "draw_date", "draw_time");

-- AddForeignKey
ALTER TABLE "game_history" ADD CONSTRAINT "game_history_state_id_fkey" FOREIGN KEY ("state_id") REFERENCES "states"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_history" ADD CONSTRAINT "game_history_game_type_id_fkey" FOREIGN KEY ("game_type_id") REFERENCES "game_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
