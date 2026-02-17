import { Request, Response } from 'express';
import { sendSuccess, sendError } from '../../utils/helpers/response';
import { HttpStatus } from '../../utils/constants/enums';
import * as predictionService from '../../services/prediction.service';
import prisma from '../../config/prisma';


/**
 * GET /api/predictions/:jobId/status - Check job status and get predictions
 */
export const getPredictionsStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { jobId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      sendError(res, 'User not authenticated', HttpStatus.UNAUTHORIZED);
      return;
    }

    if (!jobId) {
      sendError(res, 'Job ID is required', HttpStatus.BAD_REQUEST);
      return;
    }

    try {
      const { getPredictionQueue } = await import('../../queue/prediction/prediction.job');
      const queue = getPredictionQueue();
      const job = await queue.getJob(jobId);

      if (!job) {
        sendError(res, 'Job not found', HttpStatus.NOT_FOUND);
        return;
      }

      const state = await job.getState();
      const progress = job.progress;

      if (state === 'completed') {
        const result = job.returnvalue;
        const predictions = await predictionService.getLatestPredictions(result.stateId);

        sendSuccess(
          res,
          {
            jobId,
            status: 'completed',
            predictions,
          },
          'Predictions generated successfully'
        );
      } else if (state === 'failed') {
        const error = job.failedReason;
        sendError(
          res,
          `Prediction job failed: ${error || 'Unknown error'}`,
          HttpStatus.INTERNAL_SERVER_ERROR
        );
      } else {
        sendSuccess(
          res,
          {
            jobId,
            status: state,
            progress,
            message: 'Prediction job is being processed',
          },
          'Job status retrieved successfully'
        );
      }
    } catch (error: any) {
      if (error.message?.includes('not initialized')) {
        sendError(
          res,
          'Queue service is not available. Please ensure Redis is running.',
          HttpStatus.SERVICE_UNAVAILABLE
        );
        return;
      }
      throw error;
    }
    } catch (error: any) {
      sendError(
        res,
        error?.message || 'Failed to get job status',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
};

export const getLatestPredictions = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const stateId = req.user?.state?.id;
    const gameId = req.query.gameId ? parseInt(req.query.gameId as string) : undefined;

    // Validation
    if (!userId) {
      sendError(res, 'User not authenticated', HttpStatus.UNAUTHORIZED);
      return;
    }

    if (!stateId) {
      sendError(res, 'User state not found. Please update your profile with a state.', HttpStatus.BAD_REQUEST);
      return;
    }

    if (gameId !== undefined && (gameId !== 1 && gameId !== 2)) {
      sendError(res, 'Invalid gameId. Must be 1 or 2', HttpStatus.BAD_REQUEST);
      return;
    }

    try {
      // First, try to get existing predictions from DB
      const predictions = await predictionService.getLatestPredictions(stateId, gameId);
      
      // Check if we have valid predictions
      const hasValidPredictions = predictions.some(p => 
        p.predictions && Array.isArray(p.predictions) && p.predictions.length > 0
      );

      if (hasValidPredictions) {
        // Return cached predictions immediately (prevent infinite calls)
        sendSuccess(
          res,
          {
            predictions,
            status: 'completed',
          },
          'Latest predictions retrieved successfully'
        );
        return;
      }

      // If no predictions exist, check if a job is already in progress
      const jobStatus = await predictionService.isJobInProgress(stateId, 0);
      
      if (jobStatus.inProgress) {
        // Job is already running, return empty with processing status
        sendSuccess(
          res,
          {
            predictions: [],
            status: 'processing',
            jobId: jobStatus.jobId,
            message: 'Predictions are being generated. Please check back in a moment.',
          },
          'Prediction generation in progress'
        );
        return;
      }

      // No predictions and no job in progress - trigger generation
      const hasRecent = await predictionService.hasRecentPredictions(stateId, 1);
      
      if (!hasRecent) {
        // Trigger background generation
        try {
          const jobId = await predictionService.enqueuePredictionForState(stateId);
          sendSuccess(
            res,
            {
              predictions: [],
              status: 'processing',
              jobId,
              message: 'Predictions are being generated. Please check back in a moment.',
            },
            'Prediction generation started'
          );
          return;
        } catch (enqueueError: any) {
          console.error(`[getLatestPredictions] Failed to enqueue prediction:`, enqueueError);
          // Fall through to return empty predictions
        }
      }

      // Return empty predictions if all else fails
      sendSuccess(
        res,
        {
          predictions: [],
          status: 'completed',
          cached: false,
        },
        'No predictions available'
      );
    } catch (error: any) {
      console.error(`[getLatestPredictions] Failed to load predictions from DB:`, error);
      sendError(
        res,
        error?.message || 'Failed to retrieve latest predictions',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
      return;
    }
  } catch (error: any) {
    sendError(
      res,
      error?.message || 'Failed to retrieve latest predictions',
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
};

/**
 * GET /api/predictions/proof-of-performance - Get proof of performance data
 * Public endpoint - no authentication required
 */
export const getProofOfPerformance = async (req: Request, res: Response): Promise<void> => {
  try {
    const proofOfPerformance = await predictionService.getProofOfPerformance();

    sendSuccess(
      res,
      {
        proofOfPerformance,
      },
      'Proof of performance retrieved successfully'
    );
  } catch (error: any) {
    console.error('[getProofOfPerformance] Error:', error);
    sendError(
      res,
      error?.message || 'Failed to retrieve proof of performance',
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
};