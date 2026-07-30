/**
 * Utils.gs - Generic Database Repository, Entity Models, ID Generator & Setup
 * Built for Google Apps Script (V8 Engine) using Object-Oriented Design.
 */

// Global Sheet Schema Definition
const SCHEMAS = {
  Tournament: ['tournament_id', 'name', 'description', 'start_date', 'end_date', 'location', 'organizer_email', 'status', 'created_at', 'updated_at'],
  Sport: ['sport_id', 'name', 'type', 'min_players_per_team', 'max_players_per_team', 'scoring_type', 'description'],
  TournamentSport: ['ts_id', 'tournament_id', 'sport_id', 'format', 'max_teams', 'min_teams', 'points_for_win', 'points_for_draw', 'points_for_loss', 'num_groups', 'teams_advance_per_group', 'registration_deadline', 'status'],
  Team: ['team_id', 'ts_id', 'name', 'captain_email', 'registration_date', 'status', 'group_name', 'seed'],
  Player: ['player_id', 'team_id', 'name', 'email', 'phone', 'jersey_number', 'role_in_team'],
  Match: ['match_id', 'ts_id', 'round', 'round_name', 'group_name', 'team1_id', 'team2_id', 'team1_score', 'team2_score', 'winner_team_id', 'match_date', 'location', 'status', 'notes', 'updated_by', 'updated_at'],
  Ranking: ['ranking_id', 'ts_id', 'team_id', 'group_name', 'played', 'won', 'drawn', 'lost', 'goals_for', 'goals_against', 'goal_difference', 'points', 'rank'],
  User: ['user_id', 'email', 'display_name', 'created_at'],
  TournamentRole: ['role_id', 'tournament_id', 'user_email', 'role', 'assigned_at', 'assigned_by']
};

// Global In-Memory Cache Store for current execution context
const CACHE_STORE = {};

/**
 * BaseRepository Class - Generic Repository Pattern for Google Sheets
 */
class BaseRepository {
  constructor(sheetName, idColumnName) {
    this.sheetName = sheetName;
    this.idColumnName = idColumnName;
    this.headers = SCHEMAS[sheetName] || [];
  }

  /**
   * Clear in-memory cache for this sheet
   */
  clearCache() {
    delete CACHE_STORE[this.sheetName];
  }

  /**
   * Get active Spreadsheet instance
   */
  getSpreadsheet() {
    return SpreadsheetApp.getActiveSpreadsheet();
  }

  /**
   * Get or create Sheet by name
   */
  getSheet() {
    const ss = this.getSpreadsheet();
    let sheet = ss.getSheetByName(this.sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(this.sheetName);
      if (this.headers.length > 0) {
        sheet.appendRow(this.headers);
        sheet.getRange(1, 1, 1, this.headers.length).setFontWeight("bold").setBackground("#f3f4f6");
      }
    }
    return sheet;
  }

  /**
   * Get all records as Array of Objects (with In-Memory Caching for 10x Speed)
   */
  getAll() {
    if (CACHE_STORE[this.sheetName]) {
      return CACHE_STORE[this.sheetName];
    }

    const sheet = this.getSheet();
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      CACHE_STORE[this.sheetName] = [];
      return [];
    }

    const data = sheet.getRange(2, 1, lastRow - 1, this.headers.length).getValues();
    const records = data.map(row => this.rowToObject(row));
    CACHE_STORE[this.sheetName] = records;
    return records;
  }

  /**
   * Find records matching key-value pair
   */
  where(key, value) {
    const all = this.getAll();
    return all.filter(item => String(item[key]) === String(value));
  }

  /**
   * Find single record by ID
   */
  getById(id) {
    if (!id) return null;
    const all = this.getAll();
    return all.find(item => String(item[this.idColumnName]) === String(id)) || null;
  }

  /**
   * Find single record matching predicate
   */
  findOne(predicateFn) {
    const all = this.getAll();
    return all.find(predicateFn) || null;
  }

  /**
   * Insert new record object
   */
  insert(recordObj) {
    this.clearCache();
    const sheet = this.getSheet();
    const row = this.objectToRow(recordObj);
    sheet.appendRow(row);
    return recordObj;
  }

  /**
   * Update existing record by ID
   */
  update(id, updatedFields) {
    this.clearCache();
    const sheet = this.getSheet();
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return null;

    const data = sheet.getRange(2, 1, lastRow - 1, this.headers.length).getValues();
    const idIndex = this.headers.indexOf(this.idColumnName);
    if (idIndex === -1) return null;

    for (let i = 0; i < data.length; i++) {
      if (String(data[i][idIndex]) === String(id)) {
        const currentObj = this.rowToObject(data[i]);
        const mergedObj = Object.assign({}, currentObj, updatedFields);
        const newRow = this.objectToRow(mergedObj);
        sheet.getRange(i + 2, 1, 1, this.headers.length).setValues([newRow]);
        return mergedObj;
      }
    }
    return null;
  }

  /**
   * Delete record by ID
   */
  delete(id) {
    this.clearCache();
    const sheet = this.getSheet();
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return false;

    const data = sheet.getRange(2, 1, lastRow - 1, this.headers.length).getValues();
    const idIndex = this.headers.indexOf(this.idColumnName);

    for (let i = 0; i < data.length; i++) {
      if (String(data[i][idIndex]) === String(id)) {
        sheet.deleteRow(i + 2);
        return true;
      }
    }
    return false;
  }

  /**
   * Delete records by condition
   */
  deleteWhere(key, value) {
    this.clearCache();
    const sheet = this.getSheet();
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return 0;

    const data = sheet.getRange(2, 1, lastRow - 1, this.headers.length).getValues();
    const keyIndex = this.headers.indexOf(key);
    if (keyIndex === -1) return 0;

    let count = 0;
    for (let i = data.length - 1; i >= 0; i--) {
      if (String(data[i][keyIndex]) === String(value)) {
        sheet.deleteRow(i + 2);
        count++;
      }
    }
    return count;
  }

  /**
   * Helper: Convert sheet row array to object
   */
  rowToObject(row) {
    const obj = {};
    this.headers.forEach((header, index) => {
      let val = row[index];
      if (val instanceof Date) {
        val = val.toISOString();
      }
      obj[header] = val !== undefined ? val : '';
    });
    return obj;
  }

  /**
   * Helper: Convert object to sheet row array
   */
  objectToRow(obj) {
    return this.headers.map(header => {
      let val = obj[header];
      if (val === undefined || val === null) return '';
      return val;
    });
  }
}

/**
 * Utility: Generate Unique Sequential ID (e.g. T001, M012)
 */
function generateId(prefix) {
  const timestamp = new Date().getTime().toString().slice(-5);
  const random = Math.floor(Math.random() * 90 + 10);
  return `${prefix}${timestamp}${random}`;
}

/**
 * Utility: Format Date string for display
 */
function formatDate(dateString) {
  if (!dateString) return '';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${mins}`;
  } catch (e) {
    return dateString;
  }
}

/**
 * Utility: Include HTML file contents for template embedding
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Setup Database: Initialize all 9 sheets with headers and Seed Data
 */
function setupDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  Object.keys(SCHEMAS).forEach(sheetName => {
    let sheet = ss.getSheetByName(sheetName);
    const headers = SCHEMAS[sheetName];
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
    }
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(headers);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#e5e7eb");
    }
  });

  const sportRepo = new BaseRepository('Sport', 'sport_id');
  if (sportRepo.getAll().length === 0) {
    const seedSports = [
      { sport_id: 'S001', name: 'Bóng đá', type: 'team', min_players_per_team: 7, max_players_per_team: 15, scoring_type: 'goals', description: 'Môn bóng đá 7 người' },
      { sport_id: 'S002', name: 'Bóng chuyền', type: 'team', min_players_per_team: 6, max_players_per_team: 12, scoring_type: 'sets', description: 'Bóng chuyền nam/nữ' },
      { sport_id: 'S003', name: 'Cầu lông đơn', type: 'individual', min_players_per_team: 1, max_players_per_team: 1, scoring_type: 'sets', description: 'Cầu lông thi đấu đơn' },
      { sport_id: 'S004', name: 'Cầu lông đôi', type: 'doubles', min_players_per_team: 2, max_players_per_team: 2, scoring_type: 'sets', description: 'Cầu lông thi đấu đôi' },
      { sport_id: 'S005', name: 'Pickleball đôi', type: 'doubles', min_players_per_team: 2, max_players_per_team: 2, scoring_type: 'points', description: 'Pickleball thi đấu đôi' },
      { sport_id: 'S006', name: 'Bóng bàn đơn', type: 'individual', min_players_per_team: 1, max_players_per_team: 1, scoring_type: 'sets', description: 'Bóng bàn thi đấu đơn' }
    ];
    seedSports.forEach(s => sportRepo.insert(s));
    Logger.log('Seeded 6 sports successfully.');
  }

  return { success: true, message: 'Database setup completed successfully.' };
}
