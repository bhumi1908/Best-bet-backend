import { Job } from 'bullmq';
import { PredictionJobData } from './prediction.job';
import { recomputePredictionsForState } from '../../services/prediction.service';

export async function processPrediction(job: Job<PredictionJobData>) {
  const { stateId } = job.data;
  const jobId = job.id || `job-${Date.now()}`;

  try {
    const result = await recomputePredictionsForState(stateId);

    return {
      success: true,
      stateId,
      game1: {
        gameId: 1,
        predictions: result.game1,
      },
      game2: {
        gameId: 2,
        predictions: result.game2,
      },
    };
  } catch (error: any) {
    console.error(`[PredictionProcessor] Job failed, jobId=${jobId}, stateId=${stateId}:`, error);
    // Re-throw to trigger retry mechanism
    throw error;
  }
}
