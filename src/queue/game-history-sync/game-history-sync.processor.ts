import { Job } from 'bullmq';
import { GameHistorySyncJobData } from './game-history-sync.job';
import { GameHistorySyncService } from '../../services/game-history-sync.service';
import { enqueuePredictionForState } from '../../services/prediction.service';

const gameHistorySyncService = new GameHistorySyncService();

/**
 * Process game history sync job
 * Processes jobs sequentially (one at a time) to handle multiple APIs line by line
 */
export async function processGameHistorySync(job: Job<GameHistorySyncJobData>) {
  const { apiUrl } = job.data;

  try {
    const result = await gameHistorySyncService.syncGameHistory(apiUrl);
    
    if (!result.success || result.errors.length > 0) {
      // If there are errors but some data was processed, log warning
      if (result.processed > 0) {
        console.warn(`[GameHistorySyncProcessor] Sync completed with errors: ${result.errors.join('; ')}`);
      } else {
        // If no data was processed, throw error to trigger retry
        throw new Error(`Sync failed: ${result.errors.join('; ')}`);
      }
    }

    // Trigger background prediction recompute for this state only when new game history data is created.
    // This ensures predictions are only generated twice a day when new data is available from the API.
    if (result.stateId && result.created > 0) {
      console.log(`[GameHistorySyncProcessor] New game history data created (${result.created} records). Enqueuing prediction for stateId=${result.stateId}`);
      enqueuePredictionForState(result.stateId).catch((err) => {
        console.error(`[GameHistorySyncProcessor] Failed to enqueue prediction for stateId=${result.stateId}:`, err);
      });
    } else if (result.stateId && result.created === 0) {
      console.log(`[GameHistorySyncProcessor] No new game history data created. Skipping prediction generation for stateId=${result.stateId}`);
    }

    return {
      success: true,
      processed: result.processed,
      created: result.created,
      updated: result.updated,
      errors: result.errors,
      stateId: result.stateId,
    };
  } catch (error) {
    console.error(`[GameHistorySyncProcessor] Job failed for ${apiUrl}:`, error);
    throw error;
  }
}
