import prisma from '../config/prisma';
import { getPredictionQueue } from '../queue/prediction/prediction.job';
import { PredictionSheetsService, PredictionResult } from './prediction-sheets.service';

export interface PredictionResponse {
  gameId: number;
  predictions: number[][];
  date: Date;
}

const sheetsService = new PredictionSheetsService();

export async function enqueuePredictionForState(stateId: number): Promise<string> {
  const queue = getPredictionQueue();
  await queue.waitUntilReady();

  const job = await queue.add('generate-predictions', {
    stateId,
  });

  return job.id || '';
}


export async function getLatestPredictions(
  stateId: number,
  gameId?: number
): Promise<PredictionResponse[]> {
  const where: any = {
    stateId,
  };

  if (gameId !== undefined) {
    where.gameId = gameId;
  }

  const latestDate = await prisma.prediction.findFirst({
    where,
    orderBy: {
      date: 'desc',
    },
    select: {
      date: true,
    },
  });

  if (!latestDate) {
    return [];
  }

  // Get the latest prediction for each gameId on the latest date
  // If multiple predictions exist for the same date, get the one with the latest createdAt
  const predictions = await prisma.prediction.findMany({
    where: {
      ...where,
      date: latestDate.date,
    },
    orderBy: [
      { gameId: 'asc' },
      { createdAt: 'desc' },
    ],
  });

  // Group by gameId and take the first (latest) one for each gameId
  const latestByGameId = new Map<number, typeof predictions[0]>();
  for (const pred of predictions) {
    if (!latestByGameId.has(pred.gameId)) {
      latestByGameId.set(pred.gameId, pred);
    }
  }
  
  const uniquePredictions = Array.from(latestByGameId.values()).sort((a, b) => a.gameId - b.gameId);

  return uniquePredictions.map((pred) => {
    try {
      const parsed = JSON.parse(pred.predictions);
      const predictionsArray = (parsed.predictions || []).map((row: any[]) =>
        row.map((val: any) => String(val)).filter((val: string) => val && val !== '0')
      );
      return {
        gameId: pred.gameId,
        predictions: predictionsArray,
        date: pred.date,
      };
    } catch (error) {
      return {
        gameId: pred.gameId,
        predictions: [],
        date: pred.date,
      };
    }
  });
}

export async function hasRecentPredictions(stateId: number, hours: number = 1): Promise<boolean> {
  const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
  
  const recentPrediction = await prisma.prediction.findFirst({
    where: {
      stateId,
      date: {
        gte: cutoffTime,
      },
    },
  });

  return !!recentPrediction;
}

export async function isJobInProgress(stateId: number, maxAgeMinutes: number = 0): Promise<{ inProgress: boolean; jobId?: string }> {
  try {
    const queue = getPredictionQueue();
    
    const jobs = await queue.getJobs(['active', 'waiting', 'delayed']);
    const cutoffTime = Date.now() - maxAgeMinutes * 60 * 1000;
    
    const recentJob = jobs.find(job => {
      const jobData = job.data as { stateId: number };
      const isSameState = jobData.stateId === stateId;
      const isRecent = job.timestamp && job.timestamp >= cutoffTime;
      return isSameState && isRecent;
    });

    return {
      inProgress: !!recentJob,
      jobId: recentJob?.id,
    };
  } catch (error) {
    return { inProgress: false };
  }
}

/**
 * Determines draw time based on current time
 * Morning predictions (before 12:00 PM) are for MID
 * Afternoon/Evening predictions (at or after 12:00 PM) are for EVE
 * @param date - Optional date to use for determining draw time (defaults to now)
 * @returns 'MID' or 'EVE'
 */
function determineDrawTime(date?: Date): 'MID' | 'EVE' {
  const now = date ? new Date(date) : new Date();
  const hour = now.getHours();
  // If before 12:00 PM (noon), it's for MID (midday draw)
  // If at or after 12:00 PM, it's for EVE (evening draw)
  return hour < 12 ? 'MID' : 'EVE';
}

/**
 * Upserts predictions for a state
 * @param stateId - The state ID
 * @param result - The prediction result
 * @param date - Optional date for the prediction (defaults to today)
 * @param isAdminAction - If true, updates latest prediction (admin create/edit). If false, always creates new record (third-party API).
 * @param drawTime - Optional draw time (MID or EVE). If not provided, will be determined from current time.
 */
export async function upsertPredictionsForState(
  stateId: number,
  result: PredictionResult,
  date?: Date,
  isAdminAction: boolean = false,
  drawTime?: 'MID' | 'EVE'
): Promise<void> {
  const targetDate = date ? new Date(date) : new Date();
  targetDate.setHours(0, 0, 0, 0); // normalize day

  // Determine draw time if not provided
  const targetDrawTime = drawTime || determineDrawTime();

  const game1Filtered = result.game1.filter(row => row.length > 0);
  const game2Filtered = result.game2.filter(row => row.length > 0);

  const predictionsToUpsert = [
    { gameId: 1, predictions: JSON.stringify({ predictions: game1Filtered }) },
    { gameId: 2, predictions: JSON.stringify({ predictions: game2Filtered }) },
  ];

  for (const { gameId, predictions } of predictionsToUpsert) {
    if (isAdminAction) {
      // Admin action: Update latest prediction if exists, otherwise create new
      // Match by stateId, gameId, date, and drawTime
      const latest = await prisma.prediction.findFirst({
        where: { 
          stateId, 
          gameId,
          date: targetDate,
          drawTime: targetDrawTime,
        },
        orderBy: { createdAt: 'desc' },
      });

      if (latest) {
        await prisma.prediction.update({
          where: { id: latest.id },
          data: { predictions, date: targetDate, drawTime: targetDrawTime },
        });
      } else {
        await prisma.prediction.create({
          data: {
            stateId,
            gameId,
            predictions,
            date: targetDate,
            drawTime: targetDrawTime,
          },
        });
      }
    } else {
      // Third-party API: Always create new record
      await prisma.prediction.create({
        data: {
          stateId,
          gameId,
          predictions,
          date: targetDate,
          drawTime: targetDrawTime,
        },
      });
    }
  }
}

/**
 * Recomputes predictions for a state
 * @param stateId - The state ID
 * @param isAdminAction - If true, updates latest prediction (admin create/edit). If false, always creates new record (third-party API).
 */
export async function recomputePredictionsForState(
  stateId: number,
  isAdminAction: boolean = false
): Promise<PredictionResult> {
  try {
    const result = await sheetsService.generatePredictionsForState(stateId);
    
    if (result.game1.length === 0 && result.game2.length === 0) {
      return await getCachedPredictionsForState(stateId);
    }
    
    await upsertPredictionsForState(stateId, result, undefined, isAdminAction);
    return result;
  } catch (error: any) {
    try {
      const cached = await getCachedPredictionsForState(stateId);
      if (cached.game1.length > 0 || cached.game2.length > 0) {
        return cached;
      }
    } catch (cacheError) {
      // Ignore cache errors
    }
    
    throw new Error(`Failed to generate predictions for stateId=${stateId}: ${error.message}`);
  }
}

async function getCachedPredictionsForState(stateId: number): Promise<PredictionResult> {
  const predictions = await getLatestPredictions(stateId);
  
  const result: PredictionResult = {
    game1: [],
    game2: [],
  };
  
  for (const pred of predictions) {
    if (pred.gameId === 1) {
      result.game1 = (pred.predictions || []).map((row: any[]) =>
        row.map((val: any) => String(val)).filter((val: string) => val && val !== '0')
      );
    } else if (pred.gameId === 2) {
      result.game2 = (pred.predictions || []).map((row: any[]) =>
        row.map((val: any) => String(val)).filter((val: string) => val && val !== '0')
      );
    }
  }
  
  return result;
}

/**
 * Gets the second latest predictions for a state (used for proof of performance)
 * Groups predictions by createdAt runs (same second = same run)
 * A run is valid only if it contains both gameId = 1 AND gameId = 2
 * Returns predictions from the second latest valid run
 * @param stateId - The state ID
 * @param gameId - Optional game ID filter (1 or 2) - if provided, only returns that game
 * @returns Array of second latest predictions
 */
export async function getSecondLatestPredictions(
  stateId: number,
  gameId?: number
): Promise<PredictionResponse[]> {
  // Get all predictions for this state with createdAt
  const allPredictions = await prisma.prediction.findMany({
    where: {
      stateId,
    },
    select: {
      id: true,
      gameId: true,
      date: true,
      predictions: true,
      createdAt: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  if (allPredictions.length === 0) {
    return [];
  }

  // Group predictions by createdAt (same second = same run)
  // Use timestamp truncated to seconds as the run key
  const runMap = new Map<string, typeof allPredictions>();
  
  for (const pred of allPredictions) {
    // Truncate createdAt to seconds (remove milliseconds)
    const runKey = new Date(pred.createdAt);
    runKey.setMilliseconds(0);
    const runKeyStr = runKey.toISOString();
    
    if (!runMap.has(runKeyStr)) {
      runMap.set(runKeyStr, []);
    }
    runMap.get(runKeyStr)!.push(pred);
  }

  // Filter to only valid runs (contain both gameId 1 and 2)
  const validRuns: Array<{ runKey: string; predictions: typeof allPredictions; createdAt: Date }> = [];
  
  for (const [runKey, predictions] of runMap.entries()) {
    const gameIds = new Set(predictions.map(p => p.gameId));
    if (gameIds.has(1) && gameIds.has(2)) {
      // Get the createdAt from the first prediction in the run
      const createdAt = predictions[0].createdAt;
      validRuns.push({ runKey, predictions, createdAt });
    }
  }

  if (validRuns.length < 2) {
    // Need at least 2 valid runs to have a "second latest"
    return [];
  }

  // Sort valid runs by createdAt DESC (already sorted from query, but ensure order)
  validRuns.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  // Get the second latest run (index 1)
  const secondLatestRun = validRuns[1];
  
  // Filter by gameId if specified
  let runPredictions = secondLatestRun.predictions;
  if (gameId !== undefined) {
    runPredictions = runPredictions.filter(p => p.gameId === gameId);
  }

  // Sort by gameId to ensure consistent order
  runPredictions.sort((a, b) => a.gameId - b.gameId);

  // Parse and return predictions
  return runPredictions.map((pred) => {
    try {
      const parsed = JSON.parse(pred.predictions);
      const predictionsArray = (parsed.predictions || []).map((row: any[]) =>
        row.map((val: any) => String(val)).filter((val: string) => val && val !== '0')
      );
      return {
        gameId: pred.gameId,
        predictions: predictionsArray,
        date: pred.date,
      };
    } catch (error) {
      return {
        gameId: pred.gameId,
        predictions: [],
        date: pred.date,
      };
    }
  });
}

/**
 * Checks if a winning number matches any prediction in the array
 */
function checkIfWinningNumberMatches(winningNumber: string, predictions: string[][]): boolean {
  if (!winningNumber || !predictions || predictions.length === 0) {
    return false;
  }

  // Normalize winning number (remove leading zeros for comparison)
  const normalizedWinning = winningNumber.replace(/^0+/, '') || winningNumber;
  
  // Check if any prediction row matches
  for (const row of predictions) {
    if (!row || row.length === 0) continue;
    
    // Join row values and normalize
    const predictionStr = row.join('').replace(/^0+/, '') || row.join('');
    
    // Check exact match
    if (predictionStr === normalizedWinning) {
      return true;
    }
    
    // Also check if any individual value in the row matches
    for (const val of row) {
      const normalizedVal = val.replace(/^0+/, '') || val;
      if (normalizedVal === normalizedWinning) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Gets predictions for a specific draw date and draw time
 * @param stateId - The state ID
 * @param drawDate - The draw date to match predictions for
 * @param drawTime - The draw time (MID or EVE) to match predictions for
 * @returns Array of predictions for the specified draw date and time
 */
async function getPredictionsByDrawDateAndTime(
  stateId: number,
  drawDate: Date,
  drawTime: 'MID' | 'EVE'
): Promise<PredictionResponse[]> {
  // Normalize drawDate to start of day for comparison
  const normalizedDrawDate = new Date(drawDate);
  normalizedDrawDate.setHours(0, 0, 0, 0);
  
  const nextDay = new Date(normalizedDrawDate);
  nextDay.setDate(nextDay.getDate() + 1);

  // Get predictions for the draw date and draw time
  const predictions = await prisma.prediction.findMany({
    where: {
      stateId,
      date: {
        gte: normalizedDrawDate,
        lt: nextDay,
      },
      drawTime: drawTime,
    },
    orderBy: [
      { gameId: 'asc' },
      { createdAt: 'desc' },
    ],
    select: {
      id: true,
      gameId: true,
      date: true,
      predictions: true,
      drawTime: true,
    },
  });

  if (predictions.length === 0) {
    return [];
  }

  // Group by gameId and take the latest one for each gameId
  const latestByGameId = new Map<number, typeof predictions[0]>();
  for (const pred of predictions) {
    if (!latestByGameId.has(pred.gameId)) {
      latestByGameId.set(pred.gameId, pred);
    }
  }

  const uniquePredictions = Array.from(latestByGameId.values()).sort((a, b) => a.gameId - b.gameId);

  return uniquePredictions.map((pred) => {
    try {
      const parsed = JSON.parse(pred.predictions);
      const predictionsArray = (parsed.predictions || []).map((row: any[]) =>
        row.map((val: any) => String(val)).filter((val: string) => val && val !== '0')
      );
      return {
        gameId: pred.gameId,
        predictions: predictionsArray,
        date: pred.date,
      };
    } catch (error) {
      return {
        gameId: pred.gameId,
        predictions: [],
        date: pred.date,
      };
    }
  });
}

/**
 * Checks if a winning number matches predictions for a specific draw date and draw time
 * @param stateId - The state ID
 * @param drawDate - The draw date to match predictions for
 * @param drawTime - The draw time (MID or EVE) to match predictions for
 * @param winningNumber - The winning number to check
 * @returns true if the winning number matches any prediction for the specified draw date and time
 */
export async function checkIfDrawMatchesPrediction(
  stateId: number,
  drawDate: Date,
  drawTime: 'MID' | 'EVE',
  winningNumber: string
): Promise<boolean> {
  if (!winningNumber || !stateId) {
    return false;
  }

  // Get predictions for the exact draw date and draw time
  const predictionsForDraw = await getPredictionsByDrawDateAndTime(
    stateId,
    drawDate,
    drawTime
  );

  if (predictionsForDraw.length === 0) {
    return false;
  }

  // Combine predictions from both games
  const allPredictions: string[][] = [];
  
  for (const pred of predictionsForDraw) {
    if (pred.predictions && Array.isArray(pred.predictions)) {
      for (const row of pred.predictions) {
        if (Array.isArray(row) && row.length > 0) {
          allPredictions.push(row.map(v => String(v)));
        }
      }
    }
  }

  // Check if winning number matches any prediction
  return checkIfWinningNumberMatches(winningNumber, allPredictions);
}

/**
 * Gets proof of performance data for all states
 * Returns states with their latest winning numbers and whether they match predictions
 * Includes all states, showing "N/A" for states without winning numbers
 * Matches predictions for the same draw date and time as the game history
 */
export interface ProofOfPerformanceItem {
  stateId: number;
  stateName: string;
  winningNumber: string;
  hit: boolean;
  drawDate: Date | null;
  drawTime: 'MID' | 'EVE' | null;
}

export async function getProofOfPerformance(): Promise<ProofOfPerformanceItem[]> {
  // Get all active states, sorted by name in ascending order
  const states = await prisma.state.findMany({
    where: {
      isActive: true,
      isDeleted: false,
    },
    select: {
      id: true,
      name: true,
    },
    orderBy: {
      name: 'asc',
    },
  });

  const results: ProofOfPerformanceItem[] = [];

  for (const state of states) {
    // Get the latest game history (winning number) for this state
    // Order by drawDate DESC, then by drawTime (EVE before MID) to get the most recent draw
    const latestGameHistory = await prisma.gameHistory.findFirst({
      where: {
        stateId: state.id,
      },
      orderBy: [
        {
          drawDate: 'desc',
        },
        {
          drawTime: 'desc', // EVE comes after MID alphabetically, so this gets EVE first if same date
        },
      ],
      select: {
        winningNumbers: true,
        drawDate: true,
        drawTime: true,
      },
    });

    // If no game history, show N/A
    if (!latestGameHistory || !latestGameHistory.winningNumbers) {
      results.push({
        stateId: state.id,
        stateName: state.name,
        winningNumber: 'N/A',
        hit: false,
        drawDate: null,
        drawTime: null,
      });
      continue;
    }

    // Get predictions for the same draw date AND draw time as the game history
    const predictionsForDraw = await getPredictionsByDrawDateAndTime(
      state.id,
      latestGameHistory.drawDate,
      latestGameHistory.drawTime as 'MID' | 'EVE'
    );
    let hit = false;

    // Check if winning number matches any prediction for this draw date and time
    if (predictionsForDraw.length > 0) {
      // Combine predictions from both games
      const allPredictions: string[][] = [];
      
      for (const pred of predictionsForDraw) {
        if (pred.predictions && Array.isArray(pred.predictions)) {
          for (const row of pred.predictions) {
            if (Array.isArray(row) && row.length > 0) {
              allPredictions.push(row.map(v => String(v)));
            }
          }
        }
      }
      hit = checkIfWinningNumberMatches(
        latestGameHistory.winningNumbers,
        allPredictions
      );
    }

    results.push({
      stateId: state.id,
      stateName: state.name,
      winningNumber: latestGameHistory.winningNumbers,
      hit,
      drawDate: latestGameHistory.drawDate,
      drawTime: latestGameHistory.drawTime as 'MID' | 'EVE',
    });
  }

  return results;
}