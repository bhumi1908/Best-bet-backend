import { format } from 'date-fns';
import prisma from '../config/prisma';
import { GoogleSheetsService } from './google-sheets.service';

export interface GameHistoryRow {
  drawDate: Date;
  winningNumbers: string;
  drawTime: 'MID' | 'EVE';
}

export interface PredictionResult {
  game1: string[][]; // 20 rows × 6 columns from Results!AD73:AI92
  game2: string[][]; // 20 rows × 2 columns from Data!AF5:AG24
}

export class PredictionSheetsService {
  private sheetsService: GoogleSheetsService;
  private masterSpreadsheetId: string;
  private templateDataSheetName: string;
  private templateResultSheetName: string;

  constructor() {
    this.sheetsService = new GoogleSheetsService();
    
    this.masterSpreadsheetId = process.env.GOOGLE_SHEETS_MASTER_SPREADSHEET_ID || '';
    if (!this.masterSpreadsheetId) {
      throw new Error('GOOGLE_SHEETS_MASTER_SPREADSHEET_ID environment variable is required');
    }

    // Template sheet names - can be overridden via env vars
    this.templateDataSheetName = process.env.GOOGLE_SHEETS_TEMPLATE_DATA_SHEET || 'Data';
    this.templateResultSheetName = process.env.GOOGLE_SHEETS_TEMPLATE_RESULT_SHEET || 'Results';
  }

  /**
   * Generate predictions for a state
   */
  async generatePredictionsForState(stateId: number): Promise<PredictionResult> {
    // Get state information
    const state = await prisma.state.findUnique({
      where: { id: stateId },
      select: { name: true, code: true },
    });

    if (!state) {
      throw new Error(`State not found for stateId: ${stateId}`);
    }

    // Use state name for temp sheet names (sanitize for sheet name requirements)
    const stateName = this.sanitizeSheetName(state.name || state.code || `State${stateId}`);
    const timestamp = Date.now();
    const tempDataSheetName = `temp_data_${stateName}_${timestamp}`;
    const tempResultSheetName = `temp_result_${stateName}_${timestamp}`;

    // Get all game history for this state
    const gameHistory = await prisma.gameHistory.findMany({
      where: { stateId },
      orderBy: [{ drawDate: 'desc' }, { drawTime: 'desc' }],
      select: { drawDate: true, winningNumbers: true, drawTime: true },
    });

    if (gameHistory.length === 0) {
      throw new Error(`No game history found for stateId: ${stateId}`);
    }

    let tempDataSheetId: number | null = null;
    let tempResultSheetId: number | null = null;

    try {
      // Create temp sheets by copying template sheets
      const templateDataSheetId = await this.sheetsService.getSheetId(
        this.masterSpreadsheetId,
        this.templateDataSheetName
      );
      const templateResultSheetId = await this.sheetsService.getSheetId(
        this.masterSpreadsheetId,
        this.templateResultSheetName
      );

      if (!templateDataSheetId) {
        throw new Error(`Template data sheet "${this.templateDataSheetName}" not found in master spreadsheet`);
      }
      if (!templateResultSheetId) {
        throw new Error(`Template result sheet "${this.templateResultSheetName}" not found in master spreadsheet`);
      }

      // Copy template sheets to create temp sheets
      tempDataSheetId = await this.sheetsService.copySheet(
        this.masterSpreadsheetId,
        templateDataSheetId,
        this.masterSpreadsheetId,
        tempDataSheetName
      );

      tempResultSheetId = await this.sheetsService.copySheet(
        this.masterSpreadsheetId,
        templateResultSheetId,
        this.masterSpreadsheetId,
        tempResultSheetName
      );

      // Update formulas in temp_result sheet to reference temp_data instead of template Data sheet
      // This fixes the issue where formulas still reference the original "Data" sheet
      await this.sheetsService.replaceSheetReferencesInFormulas(
        this.masterSpreadsheetId,
        tempResultSheetId,
        this.templateDataSheetName, // Old reference: "Data"
        tempDataSheetName // New reference: "temp_data_stateName_timestamp"
      );

      // Convert game history to rows
      const gameHistoryRows: GameHistoryRow[] = gameHistory.map((gh) => ({
        drawDate: gh.drawDate,
        winningNumbers: gh.winningNumbers,
        drawTime: gh.drawTime as 'MID' | 'EVE',
      }));

      // Write game history data to temp_data sheet
      await this.writeGameHistoryData(tempDataSheetName, gameHistoryRows);

      // Wait for Google Sheets to calculate formulas
      // Google Sheets calculates automatically, but we wait a bit to ensure completion
      await this.sheetsService.waitForCalculation(this.masterSpreadsheetId, 30000, 2000);

      // Read predictions
      const game1Predictions = await this.readGame1Predictions(tempResultSheetName);
      const game2Predictions = await this.readGame2Predictions(tempDataSheetName);
      
      return {
        game1: game1Predictions,
        game2: game2Predictions,
      };
    } catch (error: any) {
      throw new Error(`Failed to generate predictions for state ${stateId}: ${error.message}`);
    } finally {
      // Cleanup: Delete temp sheets
      try {
        if (tempDataSheetId !== null) {
          await this.sheetsService.deleteSheet(this.masterSpreadsheetId, tempDataSheetId);
        }
      } catch (error) {
        console.error(`Failed to delete temp data sheet: ${error}`);
      }

      try {
        if (tempResultSheetId !== null) {
          await this.sheetsService.deleteSheet(this.masterSpreadsheetId, tempResultSheetId);
        }
      } catch (error) {
        console.error(`Failed to delete temp result sheet: ${error}`);
      }

      // Also try to delete by name as fallback
      try {
        await this.sheetsService.deleteSheetByName(this.masterSpreadsheetId, tempDataSheetName);
      } catch (error) {
        console.error(`Failed to delete temp data sheet: ${error}`);
      }

      try {
        await this.sheetsService.deleteSheetByName(this.masterSpreadsheetId, tempResultSheetName);
      } catch (error) {
        console.error(`Failed to delete temp result sheet: ${error}`);
      }
    }
  }

  /**
   * Write game history data to a sheet
   */
  private async writeGameHistoryData(
    sheetName: string,
    gameHistoryRows: GameHistoryRow[]
  ): Promise<void> {
    // Clear existing data in range A5:E2000
    try {
      await this.sheetsService.clearRange(
        this.masterSpreadsheetId,
        `${sheetName}!A5:E2000`
      );
    } catch (error) {
      // Ignore clear errors - range might not exist yet
    }

    // Prepare data rows
    const values: any[][] = [];

    for (const row of gameHistoryRows) {
      try {
        const formattedDate = format(new Date(row.drawDate), 'M/d/yyyy');
        const winningNumbers = row.winningNumbers;

        if (winningNumbers.length < 3) {
          continue;
        }

        const p1 = winningNumbers[0] || '';
        const p2 = winningNumbers[1] || '';
        const p3 = winningNumbers[2] || '';
        const drawTimeStr = row.drawTime === 'MID' ? 'Mid' : 'Eve';

        values.push([
          formattedDate,
          p1 ? Number(p1) : '',
          p2 ? Number(p2) : '',
          p3 ? Number(p3) : '',
          drawTimeStr,
        ]);
      } catch (error) {
        console.error(`Error processing game history row: ${error}`);
        continue;
      }
    }

    if (values.length === 0) {
      return;
    }

    // Write data starting at A5
    const range = `${sheetName}!A5:E${4 + values.length}`;
    await this.sheetsService.writeRange(this.masterSpreadsheetId, range, values);
  }

  /**
   * Read Game 1 predictions from Results sheet (AD73:AI92)
   */
  private async readGame1Predictions(sheetName: string): Promise<string[][]> {
    const range = `${sheetName}!AD73:AI92`;
    const values = await this.sheetsService.readRange(this.masterSpreadsheetId, range);

    const predictions: string[][] = [];

    for (const row of values) {
      const rowData: string[] = [];
      for (let col = 0; col < 6; col++) {
        const value = row[col];
        if (value !== undefined && value !== null && value !== '') {
          rowData.push(String(value));
        }
      }
      if (rowData.length > 0) {
        predictions.push(rowData);
      }
    }

    return predictions;
  }

  /**
   * Read Game 2 predictions from Data sheet (AF5:AG24)
   */
  private async readGame2Predictions(sheetName: string): Promise<string[][]> {
    const range = `${sheetName}!AF5:AG24`;
    const values = await this.sheetsService.readRange(this.masterSpreadsheetId, range);

    const predictions: string[][] = [];

    for (const row of values) {
      const rowData: string[] = [];
      for (let col = 0; col < 2; col++) {
        const value = row[col];
        if (value !== undefined && value !== null && value !== '') {
          rowData.push(String(value));
        }
      }
      if (rowData.length > 0) {
        predictions.push(rowData);
      }
    }

    return predictions;
  }

  /**
   * Sanitize sheet name to meet Google Sheets requirements
   * Sheet names cannot contain: / \ ? * [ ]
   */
  private sanitizeSheetName(name: string): string {
    return name
      .replace(/[\/\\?*\[\]]/g, '_')
      .replace(/\s+/g, '_')
      .substring(0, 100); // Google Sheets has a 100 character limit
  }
}
