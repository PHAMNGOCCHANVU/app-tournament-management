/**
 * DB_Helper.js - Generic Database Repository, Batch Operations, ID Generator & Formatters
 * Built for Google Apps Script (V8 Engine) using Object-Oriented Design.
 */

/**
 * BaseRepository Class - Generic Repository Pattern for Google Sheets
 */
class BaseRepository {
  constructor(sheetName, idColumnName) {
    this.sheetName = sheetName;
    this.idColumnName = idColumnName;
    this.headers = (typeof SCHEMAS !== 'undefined' && SCHEMAS[sheetName]) ? SCHEMAS[sheetName] : [];
  }

  /**
   * Clear in-memory cache for this sheet
   */
  clearCache() {
    if (typeof CACHE_STORE !== 'undefined') {
      delete CACHE_STORE[this.sheetName];
    }
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
    if (typeof CACHE_STORE !== 'undefined' && CACHE_STORE[this.sheetName]) {
      return CACHE_STORE[this.sheetName];
    }

    const sheet = this.getSheet();
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      if (typeof CACHE_STORE !== 'undefined') {
        CACHE_STORE[this.sheetName] = [];
      }
      return [];
    }

    const data = sheet.getRange(2, 1, lastRow - 1, this.headers.length).getValues();
    const records = data.map(row => this.rowToObject(row));
    if (typeof CACHE_STORE !== 'undefined') {
      CACHE_STORE[this.sheetName] = records;
    }
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
   * Batch insert records using setValues for high performance
   */
  batchInsert(records) {
    if (!Array.isArray(records) || records.length === 0) return [];
    this.clearCache();
    const sheet = this.getSheet();
    const startRow = sheet.getLastRow() + 1;
    const rows = records.map(r => this.objectToRow(r));
    sheet.getRange(startRow, 1, rows.length, this.headers.length).setValues(rows);
    return records;
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
 * Utility: Generate Unique ID using UUID to prevent collisions
 */
function generateId(prefix) {
  return `${prefix}${Utilities.getUuid().replace(/-/g, '').substring(0, 12)}`;
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
