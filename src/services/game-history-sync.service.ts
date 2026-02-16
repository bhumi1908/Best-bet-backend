import prisma from '../config/prisma';
import { Prisma } from '../generated/prisma/client';
import { LotteryApiService, ProcessedDraw } from './lottery-api.service';

export interface SyncResult {
  success: boolean;
  processed: number;
  created: number;
  updated: number;
  errors: string[];
  stateId?: number;
}

export class GameHistorySyncService {

  /**
   * Sync lottery data from API to database
   */
  async syncGameHistory(apiUrl: string): Promise<SyncResult> {
    const result: SyncResult = {
      success: true,
      processed: 0,
      created: 0,
      updated: 0,
      errors: [],
    };

    try {
      // Step 1: Fetch data from API
      const processedDraws = await LotteryApiService.fetchLotteryData(apiUrl);
      if (processedDraws.length === 0) {
        return result;
      }

      // Step 2: Extract state code from first draw (all draws should have same state)
      const firstDrawStateCode = processedDraws[0]?.stateCode;

      if (!firstDrawStateCode) {
        result.errors.push('Could not extract state code from API response');
        return result;
      }

      // Get or create state using extracted state code
      let state = await prisma.state.findFirst({
        where: {
          code: { equals: firstDrawStateCode, mode: 'insensitive' },
        },
      });

      if (!state) {
        // Create state with code from API
        // State name will be the code if not found (can be updated later)
        state = await prisma.state.create({
          data: {
            name: firstDrawStateCode, // Use code as name initially
            code: firstDrawStateCode,
            isActive: true,
          },
        });
      } 

      // Expose stateId in result so downstream processes (e.g. predictions) know which state was updated
      result.stateId = state.id;

      // Step 3: Process each draw
      for (const draw of processedDraws) {
        try {
          // Skip if winning numbers are missing
          if (!draw.winningNumbers || draw.winningNumbers.trim() === '') {
            result.errors.push(`Skipping draw: missing winning numbers`);
            continue;
          }

          // Get or create game type
          let gameType = await prisma.gameType.findFirst({
            where: {
              OR: [
                { name: { equals: draw.gameName, mode: 'insensitive' } },
                { code: { equals: draw.gameCode, mode: 'insensitive' } },
              ],
            },
          });

          if (!gameType) {
            gameType = await prisma.gameType.create({
              data: {
                name: draw.gameName,
                code: draw.gameCode,
                isActive: true,
              },
            });
          }

          // Use draw date as-is (API returns UTC noon so calendar date is preserved in DB)
          const drawDate = new Date(draw.drawDate);

          // Match existing by same calendar date (UTC) and draw time
          const y = drawDate.getUTCFullYear();
          const m = drawDate.getUTCMonth();
          const d = drawDate.getUTCDate();
          const drawDateStart = new Date(Date.UTC(y, m, d, 0, 0, 0, 0));
          const drawDateEnd = new Date(Date.UTC(y, m, d, 23, 59, 59, 999));

          const existingHistory = await prisma.gameHistory.findFirst({
            where: {
              stateId: state.id,
              gameTypeId: gameType.id,
              drawDate: { gte: drawDateStart, lte: drawDateEnd },
              drawTime: draw.drawTime,
            },
          });
          
          if (existingHistory) {
            result.processed++;
            continue;
          }

          // Prepare prize amount (optional - null if not present)
          const prizeAmount = draw.prizeAmount !== undefined && draw.prizeAmount !== null
            ? new Prisma.Decimal(draw.prizeAmount)
            : null;

          // Prepare total winners (optional - null if not present, but default to 0 for new records)
          const totalWinners = draw.totalWinners !== undefined && draw.totalWinners !== null
            ? draw.totalWinners
            : null;

          // Create new record with idempotency protection (unique constraint)
          try {  
             const createdRecord = await prisma.gameHistory.create({
              data: {
                stateId: state.id,
                gameTypeId: gameType.id,
                drawDate,
                drawTime: draw.drawTime,
                winningNumbers: draw.winningNumbers,
                totalWinners: totalWinners ?? 0,
                prizeAmount,
                resultStatus: 'WIN',
              },
            }); 
            // CRITICAL: Verify record was actually created by querying it back
            const verifyRecord = await prisma.gameHistory.findUnique({
              where: { id: createdRecord.id },
            });
            
            if (!verifyRecord) {
              throw new Error('Record was created but could not be verified in database');
            }
            
            result.created++;
            result.processed++;
       } catch (createError: any) {
            // Handle race condition: if another process created it between check and create
            if (createError?.code === 'P2002') {
              result.processed++;
            } else {
              throw createError;
            }
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          result.errors.push(`Error processing draw: ${errorMessage}`);
        }
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      result.success = false;
      result.errors.push(`Sync failed: ${errorMessage}`);
      throw error;
    }
  }
}
