
import { google } from 'googleapis';
import * as path from 'path';
import * as fs from 'fs';

export class GoogleSheetsService {
  private sheets: any;
  private auth: any;
  private readonly maxRetries = 3;
  private readonly retryDelayMs = 1000;
  private readonly rateLimitDelayMs = 100; // Delay between requests to avoid rate limits

  constructor() {
    this.initializeAuth();
  }

  /**
   * Retry wrapper with exponential backoff
   */
  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    retries: number = this.maxRetries
  ): Promise<T> {
    try {
      // Add small delay to avoid rate limits
      await new Promise((resolve) => setTimeout(resolve, this.rateLimitDelayMs));
      return await fn();
    } catch (error: any) {
      // Check if it's a rate limit error
      if (
        error.code === 429 ||
        error.message?.includes('rate limit') ||
        error.message?.includes('quota')
      ) {
        if (retries > 0) {
          const delay = this.retryDelayMs * (this.maxRetries - retries + 1);
          console.warn(
            `Rate limit hit, retrying after ${delay}ms (${retries} retries left)`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          return this.retryWithBackoff(fn, retries - 1);
        }
      }

      // Check if it's a retryable error (5xx)
      if (error.code >= 500 && retries > 0) {
        const delay = this.retryDelayMs * (this.maxRetries - retries + 1);
        console.warn(
          `Server error, retrying after ${delay}ms (${retries} retries left)`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.retryWithBackoff(fn, retries - 1);
      }

      throw error;
    }
  }

  private initializeAuth() {
    try {
      // Try multiple possible paths for credentials
      const possiblePaths = [
        path.join(process.cwd(), 'src', 'config', 'google-sheets-credentials.json'),
        path.join(process.cwd(), 'config', 'google-sheets-credentials.json'),
        path.join(__dirname, '..', 'config', 'google-sheets-credentials.json'),
        process.env.GOOGLE_SHEETS_CREDENTIALS_PATH || '',
      ].filter(Boolean);

      let credentialsPath: string | null = null;
      for (const possiblePath of possiblePaths) {
        if (fs.existsSync(possiblePath)) {
          credentialsPath = possiblePath;
          break;
        }
      }

      if (!credentialsPath) {
        throw new Error(
          `Google Sheets credentials not found. Tried: ${possiblePaths.join(', ')}`
        );
      }

      const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));

      this.auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });

      this.sheets = google.sheets({ version: 'v4', auth: this.auth });
    } catch (error: any) {
      throw new Error(`Failed to initialize Google Sheets service: ${error.message}`);
    }
  }

  /**
   * Create a new spreadsheet
   */
  async createSpreadsheet(title: string): Promise<string> {
    return this.retryWithBackoff(async () => {
      try {
        const response = await this.sheets.spreadsheets.create({
          requestBody: {
            properties: {
              title,
            },
          },
        });

        return response.data.spreadsheetId;
      } catch (error: any) {
        throw new Error(`Failed to create spreadsheet: ${error.message}`);
      }
    });
  }

  /**
   * Create a new sheet in an existing spreadsheet
   */
  async createSheet(
    spreadsheetId: string,
    sheetName: string
  ): Promise<number> {
    try {
      const response = await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: sheetName,
                },
              },
            },
          ],
        },
      });

      return response.data.replies[0].addSheet.properties.sheetId;
    } catch (error: any) {
      throw new Error(
        `Failed to create sheet "${sheetName}": ${error.message}`
      );
    }
  }

  /**
   * Delete a sheet by sheet ID
   */
  async deleteSheet(
    spreadsheetId: string,
    sheetId: number
  ): Promise<void> {
    return this.retryWithBackoff(async () => {
      try {
        await this.sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [
              {
                deleteSheet: {
                  sheetId,
                },
              },
            ],
          },
        });
      } catch (error: any) {
        // Ignore errors if sheet doesn't exist
        if (error.message?.includes('not found') || error.code === 400) {
          console.warn(`Sheet ${sheetId} may already be deleted: ${error.message}`);
          return;
        }
        throw new Error(`Failed to delete sheet: ${error.message}`);
      }
    });
  }

  /**
   * Delete a sheet by sheet name
   */
  async deleteSheetByName(
    spreadsheetId: string,
    sheetName: string
  ): Promise<void> {
    try {
      const sheetId = await this.getSheetId(spreadsheetId, sheetName);
      if (sheetId) {
        await this.deleteSheet(spreadsheetId, sheetId);
      }
    } catch (error: any) {
      throw new Error(
        `Failed to delete sheet "${sheetName}": ${error.message}`
      );
    }
  }

  /**
   * Get sheet ID by sheet name
   */
  async getSheetId(
    spreadsheetId: string,
    sheetName: string
  ): Promise<number | null> {
    try {
      const response = await this.sheets.spreadsheets.get({
        spreadsheetId,
      });

      const sheet = response.data.sheets?.find(
        (s: any) => s.properties.title === sheetName
      );

      return sheet?.properties.sheetId || null;
    } catch (error: any) {
      throw new Error(
        `Failed to get sheet ID for "${sheetName}": ${error.message}`
      );
    }
  }

  /**
   * Write data to a range
   */
  async writeRange(
    spreadsheetId: string,
    range: string,
    values: any[][]
  ): Promise<void> {
    return this.retryWithBackoff(async () => {
      try {
        await this.sheets.spreadsheets.values.update({
          spreadsheetId,
          range,
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values,
          },
        });
      } catch (error: any) {
        throw new Error(`Failed to write range "${range}": ${error.message}`);
      }
    });
  }

  /**
   * Read data from a range
   */
  async readRange(
    spreadsheetId: string,
    range: string
  ): Promise<any[][]> {
    return this.retryWithBackoff(async () => {
      try {
        const response = await this.sheets.spreadsheets.values.get({
          spreadsheetId,
          range,
        });

        return response.data.values || [];
      } catch (error: any) {
        throw new Error(`Failed to read range "${range}": ${error.message}`);
      }
    });
  }

  /**
   * Clear a range
   */
  async clearRange(
    spreadsheetId: string,
    range: string
  ): Promise<void> {
    try {
      await this.sheets.spreadsheets.values.clear({
        spreadsheetId,
        range,
      });
    } catch (error: any) {
      throw new Error(`Failed to clear range "${range}": ${error.message}`);
    }
  }

  /**
   * Copy a sheet within the same spreadsheet or to another spreadsheet
   */
  async copySheet(
    sourceSpreadsheetId: string,
    sourceSheetId: number,
    destinationSpreadsheetId: string,
    newSheetName: string
  ): Promise<number> {
    return this.retryWithBackoff(async () => {
      try {
        const response = await this.sheets.spreadsheets.sheets.copyTo({
          spreadsheetId: sourceSpreadsheetId,
          sheetId: sourceSheetId,
          requestBody: {
            destinationSpreadsheetId,
          },
        });

        const newSheetId = response.data.sheetId;

        // Rename the copied sheet
        await this.sheets.spreadsheets.batchUpdate({
          spreadsheetId: destinationSpreadsheetId,
          requestBody: {
            requests: [
              {
                updateSheetProperties: {
                  properties: {
                    sheetId: newSheetId,
                    title: newSheetName,
                  },
                  fields: 'title',
                },
              },
            ],
          },
        });

        return newSheetId;
      } catch (error: any) {
        throw new Error(`Failed to copy sheet: ${error.message}`);
      }
    });
  }

  /**
   * Copy a sheet by name
   */
  async copySheetByName(
    sourceSpreadsheetId: string,
    sourceSheetName: string,
    destinationSpreadsheetId: string,
    newSheetName: string
  ): Promise<number> {
    const sourceSheetId = await this.getSheetId(
      sourceSpreadsheetId,
      sourceSheetName
    );

    if (!sourceSheetId) {
      throw new Error(`Source sheet "${sourceSheetName}" not found`);
    }

    return this.copySheet(
      sourceSpreadsheetId,
      sourceSheetId,
      destinationSpreadsheetId,
      newSheetName
    );
  }

  /**
   * Batch update operations
   */
  async batchUpdate(
    spreadsheetId: string,
    requests: any[]
  ): Promise<void> {
    return this.retryWithBackoff(async () => {
      try {
        await this.sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests,
          },
        });
      } catch (error: any) {
        throw new Error(`Failed to batch update: ${error.message}`);
      }
    });
  }

  /**
   * Replace sheet references in formulas within a sheet
   * This is used to update formulas that reference one sheet to reference another
   */
  async replaceSheetReferencesInFormulas(
    spreadsheetId: string,
    sheetId: number,
    oldSheetName: string,
    newSheetName: string
  ): Promise<void> {
    return this.retryWithBackoff(async () => {
      try {
        // Use findReplace to update all formulas that reference the old sheet name
        // Google Sheets formulas can reference sheets as: Data!A1 or 'Data'!A1
        // We need to handle both cases
        
        // Pattern 1: Replace "Data!" with "temp_data_...!"
        // Pattern 2: Replace "'Data'!" with "'temp_data_...'!"
        // Pattern 3: Replace "Data:" with "temp_data_...:" (for ranges)
        
        const patterns = [
          // Replace unquoted sheet name with exclamation: Data! -> temp_data_...!
          {
            find: `${oldSheetName}!`,
            replace: `${newSheetName}!`,
          },
          // Replace quoted sheet name: 'Data'! -> 'temp_data_...'!
          {
            find: `'${oldSheetName}'!`,
            replace: `'${newSheetName}'!`,
          },
          // Replace unquoted sheet name with colon: Data: -> temp_data_...:
          {
            find: `${oldSheetName}:`,
            replace: `${newSheetName}:`,
          },
          // Replace quoted sheet name with colon: 'Data': -> 'temp_data_...':
          {
            find: `'${oldSheetName}':`,
            replace: `'${newSheetName}':`,
          },
        ];

        const requests = patterns.map((pattern) => ({
          findReplace: {
            find: pattern.find,
            replacement: pattern.replace,
            sheetId: sheetId,
            matchCase: false,
            matchEntireCell: false,
            searchByRegex: false,
            includeFormulas: true, // Critical: must include formulas
          },
        }));

        if (requests.length > 0) {
          await this.batchUpdate(spreadsheetId, requests);
        }
      } catch (error: any) {
        throw new Error(
          `Failed to replace sheet references from "${oldSheetName}" to "${newSheetName}": ${error.message}`
        );
      }
    });
  }

  /**
   * Wait for spreadsheet to finish calculating (polling)
   */
  async waitForCalculation(
    spreadsheetId: string,
    maxWaitMs: number = 30000,
    pollIntervalMs: number = 1000
  ): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      try {
        // Try to read a cell to check if calculations are done
        await this.sheets.spreadsheets.get({
          spreadsheetId,
          fields: 'properties.title',
        });

        // Wait a bit for formulas to calculate
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        return;
      } catch (error) {
        // Continue polling
      }
    }
  }
}
