import prisma from '../../config/prisma';

// Types
export interface PerformancePeriod {
  period: string;
  hits: number;
  totalPlays: number;
  hitRate: number;
}

export interface BestPeriod {
  period: string;
  hits: number;
  totalPlays: number;
  hitRate: number;
}

export interface AverageHitRate {
  hitRate: number;
  totalHits: number;
  totalPlays: number;
}

export interface SummaryCard {
  period: string;
  hits: number;
  totalPlays: number;
  hitRate: number;
  trend: 'up' | 'down' | 'stable';
}

export interface StatePerformanceData {
  stateName: string;
  weekly: PerformancePeriod[];
  monthly: PerformancePeriod[];
  yearly: PerformancePeriod[];
  bestWeek: BestPeriod | null;
  bestMonth: BestPeriod | null;
  averageHitRate: AverageHitRate;
  summary: SummaryCard[];
}

interface MatchResult {
  drawDate: Date;
  winningNumber: string;
  isHit: boolean;
  weekKey: string;
  monthKey: string;
  yearKey: string;
}

// Matching utility functions
function normalizeNumber(number: string): string {
  // Remove leading zeros but keep at least one digit
  const normalized = number.replace(/^0+/, '') || number;
  return normalized;
}

function checkExactMatch(prediction: string, winningNumber: string): boolean {
  const normalizedPred = normalizeNumber(prediction);
  const normalizedWin = normalizeNumber(winningNumber);
  return normalizedPred === normalizedWin;
}

function checkBoxMatch(prediction: string, winningNumber: string): boolean {
  // Box match: same digits in any order
  const predDigits = prediction.split('').sort().join('');
  const winDigits = winningNumber.split('').sort().join('');
  return predDigits === winDigits;
}

function matchPredictionWithDraw(
  predictions: string[][],
  winningNumber: string
): boolean {
  if (!winningNumber || !predictions || predictions.length === 0) {
    return false;
  }

  // Check each prediction row
  for (const row of predictions) {
    if (!row || row.length === 0) continue;

    // Join row values to form prediction string
    const predictionStr = row.join('');

    // Check exact match
    if (checkExactMatch(predictionStr, winningNumber)) {
      return true;
    }

    // Check box match
    if (checkBoxMatch(predictionStr, winningNumber)) {
      return true;
    }
  }

  return false;
}

// Date utility functions
function getWeekKey(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust to Monday
  const monday = new Date(d.setDate(diff));
  const year = monday.getFullYear();
  const month = String(monday.getMonth() + 1).padStart(2, '0');
  const dayOfMonth = String(monday.getDate()).padStart(2, '0');
  return `${year}-W${month}-${dayOfMonth}`;
}

function formatWeekPeriod(weekKey: string, weekIndex: number): string {
  // weekKey format: YYYY-WMM-DD (Monday of the week)
  const [year, weekPart, day] = weekKey.split('-');
  const month = weekPart.substring(1);
  const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  const monthName = date.toLocaleString('default', { month: 'short' }).toUpperCase();
  
  // Format date as MON-DD, YYYY
  const formattedDate = `${monthName}-${day}, ${year}`;
  
  // Return relative format based on index
  if (weekIndex === 0) {
    return `This Week`;
  } else if (weekIndex === 1) {
    return `Last Week`;
  } else if (weekIndex === 2) {
    return `2 Weeks Ago`;
  } else if (weekIndex === 3) {
    return `3 Weeks Ago`;
  } else {
    return `${weekIndex} Weeks Ago`;
  }
}

function getMonthKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function formatMonthPeriod(monthKey: string, monthIndex: number): string {
  const [year, month] = monthKey.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1, 1);
  const monthName = date.toLocaleString('default', { month: 'short' });
  
  // Return relative format based on index
  if (monthIndex === 0) {
    return `${monthName} ${year}`;
  } else {
    return `${monthName} ${year}`;
  }
}

function getYearKey(date: Date): string {
  return String(date.getFullYear());
}

// Performance calculation functions
function calculateWeeklyPerformance(matches: MatchResult[]): PerformancePeriod[] {
  const weekMap = new Map<string, { hits: number; total: number }>();

  for (const match of matches) {
    const weekKey = match.weekKey;
    if (!weekMap.has(weekKey)) {
      weekMap.set(weekKey, { hits: 0, total: 0 });
    }
    const weekData = weekMap.get(weekKey)!;
    weekData.total++;
    if (match.isHit) {
      weekData.hits++;
    }
  }

  // Sort by weekKey descending (most recent first)
  // Store weekKey temporarily for sorting
  const weeklyDataWithKey: Array<PerformancePeriod & { weekKey: string }> = [];
  for (const [weekKey, data] of weekMap.entries()) {
    weeklyDataWithKey.push({
      period: '', // Will be set after sorting
      hits: data.hits,
      totalPlays: data.total,
      hitRate: data.total > 0 ? (data.hits / data.total) * 100 : 0,
      weekKey,
    });
  }

  // Sort by weekKey descending (most recent first)
  weeklyDataWithKey.sort((a, b) => {
    return b.weekKey.localeCompare(a.weekKey);
  });

  // Format periods with relative labels
  const weeklyData: PerformancePeriod[] = weeklyDataWithKey.slice(0, 4).map((item, index) => ({
    period: formatWeekPeriod(item.weekKey, index),
    hits: item.hits,
    totalPlays: item.totalPlays,
    hitRate: item.hitRate,
  }));

  // Return last 4 weeks
  return weeklyData;
}

function calculateMonthlyPerformance(matches: MatchResult[]): PerformancePeriod[] {
  const monthMap = new Map<string, { hits: number; total: number }>();

  for (const match of matches) {
    const monthKey = match.monthKey;
    if (!monthMap.has(monthKey)) {
      monthMap.set(monthKey, { hits: 0, total: 0 });
    }
    const monthData = monthMap.get(monthKey)!;
    monthData.total++;
    if (match.isHit) {
      monthData.hits++;
    }
  }

  const monthlyDataWithKey: Array<PerformancePeriod & { monthKey: string }> = [];
  for (const [monthKey, data] of monthMap.entries()) {
    monthlyDataWithKey.push({
      period: '', // Will be set after sorting
      hits: data.hits,
      totalPlays: data.total,
      hitRate: data.total > 0 ? (data.hits / data.total) * 100 : 0,
      monthKey,
    });
  }

  // Sort by monthKey descending (most recent first)
  monthlyDataWithKey.sort((a, b) => {
    return b.monthKey.localeCompare(a.monthKey);
  });

  // Format periods with relative labels
  const monthlyData: PerformancePeriod[] = monthlyDataWithKey.slice(0, 4).map((item, index) => ({
    period: formatMonthPeriod(item.monthKey, index),
    hits: item.hits,
    totalPlays: item.totalPlays,
    hitRate: item.hitRate,
  }));

  // Return last 4 months
  return monthlyData;
}

function calculateYearlyPerformance(matches: MatchResult[]): PerformancePeriod[] {
  const yearMap = new Map<string, { hits: number; total: number }>();

  for (const match of matches) {
    const yearKey = match.yearKey;
    if (!yearMap.has(yearKey)) {
      yearMap.set(yearKey, { hits: 0, total: 0 });
    }
    const yearData = yearMap.get(yearKey)!;
    yearData.total++;
    if (match.isHit) {
      yearData.hits++;
    }
  }

  const yearlyData: PerformancePeriod[] = [];
  for (const [yearKey, data] of yearMap.entries()) {
    yearlyData.push({
      period: yearKey,
      hits: data.hits,
      totalPlays: data.total,
      hitRate: data.total > 0 ? (data.hits / data.total) * 100 : 0,
    });
  }

  // Sort by year descending (most recent first)
  yearlyData.sort((a, b) => parseInt(b.period) - parseInt(a.period));

  // Return last 3 years
  return yearlyData.slice(0, 3);
}

function findBestWeek(weeklyData: PerformancePeriod[]): BestPeriod | null {
  if (weeklyData.length === 0) return null;

  let best = weeklyData[0];
  let bestIndex = 0;
  for (let i = 0; i < weeklyData.length; i++) {
    const week = weeklyData[i];
    if (week.hitRate > best.hitRate) {
      best = week;
      bestIndex = i;
    } else if (week.hitRate === best.hitRate && week.hits > best.hits) {
      best = week;
      bestIndex = i;
    }
  }

  // Format best week period with relative label based on its position in sorted array
  // Since weeklyData is sorted most recent first, index 0 = THIS WEEK, 1 = LAST WEEK, etc.
  let bestPeriodLabel: string;
  if (bestIndex === 0) {
    bestPeriodLabel = 'THIS WEEK';
  } else if (bestIndex === 1) {
    bestPeriodLabel = 'LAST WEEK';
  } else if (bestIndex === 2) {
    bestPeriodLabel = '2 WEEKS AGO';
  } else if (bestIndex === 3) {
    bestPeriodLabel = '3 WEEKS AGO';
  } else {
    bestPeriodLabel = `${bestIndex} WEEKS AGO`;
  }

  return {
    period: bestPeriodLabel,
    hits: best.hits,
    totalPlays: best.totalPlays,
    hitRate: best.hitRate,
  };
}

function findBestMonth(monthlyData: PerformancePeriod[]): BestPeriod | null {
  if (monthlyData.length === 0) return null;

  let best = monthlyData[0];
  for (const month of monthlyData) {
    if (month.hitRate > best.hitRate) {
      best = month;
    } else if (month.hitRate === best.hitRate && month.hits > best.hits) {
      best = month;
    }
  }

  return {
    period: best.period,
    hits: best.hits,
    totalPlays: best.totalPlays,
    hitRate: best.hitRate,
  };
}

function calculateAverageHitRate(yearlyData: PerformancePeriod[]): AverageHitRate {
  const currentYear = new Date().getFullYear();
  const currentYearData = yearlyData.find((y) => y.period === String(currentYear));

  if (!currentYearData) {
    return {
      hitRate: 0,
      totalHits: 0,
      totalPlays: 0,
    };
  }

  return {
    hitRate: currentYearData.hitRate,
    totalHits: currentYearData.hits,
    totalPlays: currentYearData.totalPlays,
  };
}

function calculateSummaryCards(
  weekly: PerformancePeriod[],
  monthly: PerformancePeriod[],
  yearly: PerformancePeriod[]
): SummaryCard[] {
  const currentYear = new Date().getFullYear();
  const currentYearData = yearly.find((y) => y.period === String(currentYear));

  // Get latest week and month
  const latestWeek = weekly[0];
  const latestMonth = monthly[0];

  // Calculate trends
  const getWeekTrend = (): 'up' | 'down' | 'stable' => {
    if (weekly.length < 2) return 'stable';
    const current = weekly[0]?.hitRate || 0;
    const previous = weekly[1]?.hitRate || 0;
    if (current > previous) return 'up';
    if (current < previous) return 'down';
    return 'stable';
  };

  const getMonthTrend = (): 'up' | 'down' | 'stable' => {
    if (monthly.length < 2) return 'stable';
    const current = monthly[0]?.hitRate || 0;
    const previous = monthly[1]?.hitRate || 0;
    if (current > previous) return 'up';
    if (current < previous) return 'down';
    return 'stable';
  };

  const getYearTrend = (): 'up' | 'down' | 'stable' => {
    if (yearly.length < 2) return 'stable';
    const current = yearly[0]?.hitRate || 0;
    const previous = yearly[1]?.hitRate || 0;
    if (current > previous) return 'up';
    if (current < previous) return 'down';
    return 'stable';
  };

  return [
    {
      period: latestWeek ? latestWeek.period : 'This Week',
      hits: latestWeek?.hits || 0,
      totalPlays: latestWeek?.totalPlays || 0,
      hitRate: latestWeek?.hitRate || 0,
      trend: getWeekTrend(),
    },
    {
      period: latestMonth ? latestMonth.period : 'This Month',
      hits: latestMonth?.hits || 0,
      totalPlays: latestMonth?.totalPlays || 0,
      hitRate: latestMonth?.hitRate || 0,
      trend: getMonthTrend(),
    },
    {
      period: currentYearData ? String(currentYear) : `Year ${currentYear}`,
      hits: currentYearData?.hits || 0,
      totalPlays: currentYearData?.totalPlays || 0,
      hitRate: currentYearData?.hitRate || 0,
      trend: getYearTrend(),
    },
  ];
}

// Main service function
export async function getStatePerformance(
  stateName: string,
  gameId?: number
): Promise<StatePerformanceData> {
  // Get state by name
  const state = await prisma.state.findFirst({
    where: {
      name: stateName,
      isActive: true,
      isDeleted: false,
    },
  });

  if (!state) {
    throw new Error(`State "${stateName}" not found`);
  }

  // Build game history query
  // Note: gameTypeId in GameHistory corresponds to gameId in Prediction
  // gameTypeId 1 = gameId 1, gameTypeId 2 = gameId 2
  const gameHistoryWhere: any = {
    stateId: state.id,
  };

  if (gameId !== undefined) {
    gameHistoryWhere.gameTypeId = gameId;
  }

  // Fetch game history for the state
  const gameHistories = await prisma.gameHistory.findMany({
    where: gameHistoryWhere,
    select: {
      drawDate: true,
      winningNumbers: true,
      drawTime: true,
      gameTypeId: true,
    },
    orderBy: {
      drawDate: 'asc',
    },
  });

  if (gameHistories.length === 0) {
    // Return empty data structure
    return {
      stateName: state.name,
      weekly: [],
      monthly: [],
      yearly: [],
      bestWeek: null,
      bestMonth: null,
      averageHitRate: {
        hitRate: 0,
        totalHits: 0,
        totalPlays: 0,
      },
      summary: [],
    };
  }

  // Fetch all predictions for the state
  const predictionsQuery: any = {
    stateId: state.id,
  };

  if (gameId !== undefined) {
    predictionsQuery.gameId = gameId;
  }

  const allPredictions = await prisma.prediction.findMany({
    where: predictionsQuery,
    select: {
      id: true,
      date: true,
      gameId: true,
      predictions: true,
      createdAt: true,
    },
    orderBy: {
      date: 'asc',
    },
  });

  if (allPredictions.length === 0) {
    // Return empty data structure
    return {
      stateName: state.name,
      weekly: [],
      monthly: [],
      yearly: [],
      bestWeek: null,
      bestMonth: null,
      averageHitRate: {
        hitRate: 0,
        totalHits: 0,
        totalPlays: 0,
      },
      summary: [],
    };
  }

  // Match predictions with draws
  const matches: MatchResult[] = [];

  for (const history of gameHistories) {
    if (!history.winningNumbers || history.winningNumbers.trim() === '') {
      continue;
    }

    // Match prediction with the same gameId as gameTypeId
    // gameTypeId in GameHistory corresponds to gameId in Prediction
    const targetGameId = history.gameTypeId;
    const relevantPredictions = allPredictions.filter((p) => p.gameId === targetGameId);

    if (relevantPredictions.length === 0) {
      continue;
    }

    // Find the most recent prediction created on or before the draw date
    let matchingPrediction = null;
    for (const pred of relevantPredictions) {
      const predDate = new Date(pred.date);
      const drawDate = new Date(history.drawDate);
      predDate.setHours(0, 0, 0, 0);
      drawDate.setHours(0, 0, 0, 0);

      if (predDate <= drawDate) {
        if (!matchingPrediction || pred.date > matchingPrediction.date) {
          matchingPrediction = pred;
        }
      }
    }

    // If no prediction found before draw date, use the earliest available prediction
    if (!matchingPrediction && relevantPredictions.length > 0) {
      matchingPrediction = relevantPredictions[0];
    }

    if (!matchingPrediction) {
      continue;
    }

    // Parse prediction JSON
    let predictionArray: string[][] = [];
    try {
      const parsed = JSON.parse(matchingPrediction.predictions);
      predictionArray = (parsed.predictions || []).map((row: any[]) =>
        row.map((val: any) => String(val))
      );
    } catch (error) {
      console.error(`Failed to parse prediction ${matchingPrediction.id}:`, error);
      continue;
    }

    // Check if prediction matches winning number
    const isHit = matchPredictionWithDraw(predictionArray, history.winningNumbers);

    // Calculate period keys
    const drawDate = new Date(history.drawDate);
    const weekKey = getWeekKey(drawDate);
    const monthKey = getMonthKey(drawDate);
    const yearKey = getYearKey(drawDate);

    matches.push({
      drawDate,
      winningNumber: history.winningNumbers,
      isHit,
      weekKey,
      monthKey,
      yearKey,
    });
  }

  // Calculate performance metrics
  const weekly = calculateWeeklyPerformance(matches);
  const monthly = calculateMonthlyPerformance(matches);
  const yearly = calculateYearlyPerformance(matches);
  const bestWeek = findBestWeek(weekly);
  const bestMonth = findBestMonth(monthly);
  const averageHitRate = calculateAverageHitRate(yearly);
  const summary = calculateSummaryCards(weekly, monthly, yearly);

  return {
    stateName: state.name,
    weekly,
    monthly,
    yearly,
    bestWeek,
    bestMonth,
    averageHitRate,
    summary,
  };
}
