import axios, { AxiosError } from 'axios';

/**
 * DownTack API Response Structure
 */
export interface LotteryNumber {
  value: string;
  order: number;
  specialBall: {
    name: string;
    ballType: string;
  } | null;
}

export interface LotteryDraw {
  date: string; // Format: "01/15/2026"
  nextDrawDate?: string;
  nextDrawJackpot?: number;
  number: string | null;
  numbers: LotteryNumber[];
  prizes: any[];
  extraFields: any[];
}

export interface LotteryPlay {
  name: string; // "Day" or "Evening"
  draws: LotteryDraw[];
}

export interface LotteryGame {
  name: string; // e.g., "Pick 3"
  code: string; // e.g., "US_NC_P3"
  plays: LotteryPlay[];
}

export interface ProcessedDraw {
  gameName: string;
  gameCode: string;
  stateCode?: string;
  drawDate: Date;
  drawTime: 'MID' | 'EVE';
  winningNumbers: string;
  totalWinners?: number | null;
  prizeAmount?: number | null;
}

export class LotteryApiService {
  /**
   * Fetch lottery data from third-party API (DownTack format)
   */
  static async fetchLotteryData(apiUrl: string): Promise<ProcessedDraw[]> {
    try {
      const response = await axios.get<LotteryGame[]>(apiUrl, {
        timeout: 30000, // 30 seconds timeout
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Best-Bet-Backend/1.0',
        },
      });

      if (!Array.isArray(response.data) || response.data.length === 0) {
        console.warn(`No games found in API response from ${apiUrl}`);
          return [];
      }

      const processedDraws: ProcessedDraw[] = [];

      // Process each game
      for (const game of response.data) {
        // Extract state code from game code (e.g., "US_NC_P3" -> "NC")
        const stateCode = this.extractStateCode(game.code);
        
        // Process each play (Day/Evening)
        for (const play of game.plays) {
          // Map play name to draw time
          const drawTime: 'MID' | 'EVE' = 
            play.name.toLowerCase().includes('day') || play.name.toLowerCase().includes('midday')
              ? 'MID'
              : 'EVE';

          // Process each draw in the play
          for (const draw of play.draws) {
            // Parse date from "01/15/2026" format
            const drawDate = this.parseDate(draw.date);

            // Extract winning numbers from numbers array
            // IMPORTANT: don't blindly drop the last element (it may be a real digit for some games).
            // Filter out special balls explicitly when present.
            const winningNumbers = (Array.isArray(draw.numbers) ? draw.numbers : [])
              .slice()
              .sort((a, b) => a.order - b.order) // Sort by order
              .filter((num) => !num.specialBall)
              .map(num => num.value)
              .join('');

            // Extract prize information if available (can be null if not present)
            let prizeAmount: number | null = null;
            let totalWinners: number | null = null;

            if (draw.prizes && draw.prizes.length > 0) {
              // Try to extract prize amount from prizes array
              const totalPrize = draw.prizes.reduce((sum: number, prize: any) => {
                return sum + (prize.amount || prize.prize || 0);
              }, 0);
              if (totalPrize > 0) {
                prizeAmount = totalPrize;
              }
            }

            // Extract total winners if available in draw data
            // (Currently API doesn't provide this, but keeping for future)
            if (draw.extraFields && Array.isArray(draw.extraFields)) {
              const winnersField = draw.extraFields.find((field: any) => 
                field.name?.toLowerCase().includes('winner') || 
                field.key?.toLowerCase().includes('winner')
              );
              if (winnersField?.value) {
                totalWinners = parseInt(winnersField.value, 10) || null;
              }
            }

            processedDraws.push({
              gameName: game.name,
              gameCode: game.code,
              stateCode,
              drawDate,
              drawTime,
              winningNumbers,
              totalWinners,
              prizeAmount,
            });
          }
        }
      }

      if (processedDraws.length === 0) {
        console.warn(`No draws found in API response from ${apiUrl}`);
        return [];
      }

      return processedDraws;
    } catch (error) {
      const axiosError = error as AxiosError;
      
      if (axiosError.response) {
        // API responded with error status
        throw new Error(
          `API request failed with status ${axiosError.response.status}: ${axiosError.response.statusText}`
        );
      } else if (axiosError.request) {
        // Request was made but no response received
        throw new Error(`No response received from API: ${apiUrl}`);
      } else {
        // Error setting up the request
        throw new Error(`Error making API request: ${axiosError.message}`);
      }
    }
  }

  /**
   * Parse date from "MM/DD/YYYY" format (US API format).
   * Returns a Date at noon UTC so the calendar date is preserved when stored
   * in the database (Timestamptz), regardless of server timezone.
   */
  private static parseDate(dateStr: string): Date {
    if (!dateStr) {
      return new Date();
    }

    // Handle "MM/DD/YYYY" format
    const parts = dateStr.trim().split('/');
    if (parts.length === 3) {
      const month = parseInt(parts[0], 10) - 1; // Month is 0-indexed
      const day = parseInt(parts[1], 10);
      const year = parseInt(parts[2], 10);
      // Use noon UTC so the calendar date is unambiguous when persisted as Timestamptz
      return new Date(Date.UTC(year, month, day, 12, 0, 0, 0));
    }

    // Fallback to standard Date parsing
    return new Date(dateStr);
  }

  /**
   * Extract state code from game code
   * Examples: "US_NC_P3" -> "NC", "US_TX_P4" -> "TX"
   */
  private static extractStateCode(gameCode: string): string | undefined {
    if (!gameCode) {
      return undefined;
    }

    // Split by underscore and get the middle part (state code)
    // Format: US_XX_YY where XX is state code
    const parts = gameCode.split('_');
    if (parts.length >= 2) {
      // Return the middle part (index 1) which is typically the state code
      return parts[1]?.toUpperCase();
    }

    return undefined;
  }
}
