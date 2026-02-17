// Predictions Seed Data
// This seed creates predictions from a start date until 10-02-2026
// Creates daily predictions for MID and EVE draws for both game-1 and game-2
// Format: [["1", "2", "3"], ["2", "3", "1"], ["4", "5", "6"]] - nested string arrays

/**
 * Generate random 3-digit number as string
 */
function generateRandomNumber(): string {
  const digits = [
    Math.floor(Math.random() * 10),
    Math.floor(Math.random() * 10),
    Math.floor(Math.random() * 10),
  ];
  return digits.join('');
}

/**
 * Generate a box match (same digits, different order)
 */
function generateBoxMatch(winningNumber: string): string {
  const digits = winningNumber.split('').sort(() => Math.random() - 0.5);
  return digits.join('');
}

/**
 * Generate predictions as nested string arrays
 * Format: [["1", "2", "3"], ["2", "3", "1"], ["4", "5", "6"]]
 * Each prediction is a 3-digit number split into an array of strings
 * @param winningNumber - The winning number for this draw (optional, for creating hits)
 * @param shouldHit - Whether this prediction should include a hit
 * @param numPredictions - Number of predictions to generate (default: 10-15)
 */
function generatePredictions(
  winningNumber?: string,
  shouldHit: boolean = false,
  numPredictions: number = Math.floor(Math.random() * 6) + 10 // 10-15 predictions
): string[][] {
  const predictions: string[][] = [];

  // If shouldHit and we have a winning number, include it in predictions
  if (shouldHit && winningNumber) {
    // Add exact match as array of strings: "123" -> ["1", "2", "3"]
    predictions.push(winningNumber.split(''));

    // 30% chance to also add a box match
    if (Math.random() < 0.3) {
      const boxMatch = generateBoxMatch(winningNumber);
      predictions.push(boxMatch.split(''));
    }
  }

  // Fill remaining predictions with random numbers
  const remaining = numPredictions - predictions.length;
  for (let i = 0; i < remaining; i++) {
    const randomNum = generateRandomNumber();
    // Convert "123" to ["1", "2", "3"]
    predictions.push(randomNum.split(''));
  }

  // Shuffle predictions to make it more realistic
  return predictions.sort(() => Math.random() - 0.5);
}

/**
 * Generate all dates from start date to end date (inclusive)
 */
function generateDateRange(startDate: Date, endDate: Date): Date[] {
  const dates: Date[] = [];
  const currentDate = new Date(startDate);
  
  while (currentDate <= endDate) {
    dates.push(new Date(currentDate));
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return dates;
}

/**
 * Generate predictions from start date until 10-02-2026
 * Creates 4 records per day:
 * - gameId: 1, drawTime: 'MID'
 * - gameId: 1, drawTime: 'EVE'
 * - gameId: 2, drawTime: 'MID'
 * - gameId: 2, drawTime: 'EVE'
 */
export function generatePredictionsFromGameHistory() {
  // Start from a reasonable date (e.g., 30 days before end date)
  const endDate = new Date('2026-02-10');
  endDate.setHours(0, 0, 0, 0);
  
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 30); // 30 days before end date
  startDate.setHours(0, 0, 0, 0);

  const dates = generateDateRange(startDate, endDate);
  const predictions: Array<{
    date: Date;
    gameId: number;
    stateId: number;
    drawTime: 'MID' | 'EVE';
    predictions: string; // JSON string with format: { predictions: ["123", "231", ...] }
  }> = [];

  // Generate predictions for each date
  for (const date of dates) {
    // For each date, create 4 prediction records
    const drawTimes: Array<'MID' | 'EVE'> = ['MID', 'EVE'];
    const gameIds = [1, 2];

    for (const drawTime of drawTimes) {
      for (const gameId of gameIds) {
        // 65% chance this prediction will hit (to create realistic performance)
        const shouldHit = Math.random() < 0.65;
        
        // Generate a random winning number for potential hit
        const winningNumber = shouldHit ? generateRandomNumber() : undefined;
        
        // Generate predictions as string arrays
        const predictionStrings = generatePredictions(
          winningNumber,
          shouldHit,
          Math.floor(Math.random() * 6) + 10 // 10-15 predictions
        );

        // Format: { predictions: [["1", "2", "3"], ["2", "3", "1"], ["4", "5", "6"]] }
        const predictionsJson = JSON.stringify({ predictions: predictionStrings });

        predictions.push({
          date: new Date(date),
          gameId,
          stateId: 1, // Default state (you can modify this)
          drawTime,
          predictions: predictionsJson,
        });
      }
    }
  }

  return predictions.sort((a, b) => {
    // Sort by date, then drawTime, then gameId
    if (a.date.getTime() !== b.date.getTime()) {
      return a.date.getTime() - b.date.getTime();
    }
    if (a.drawTime !== b.drawTime) {
      return a.drawTime === 'MID' ? -1 : 1;
    }
    return a.gameId - b.gameId;
  });
}
