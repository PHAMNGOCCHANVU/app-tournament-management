/**
 * Code.gs - Entry Point & Router for Apps Script Web App
 */

function doGet(e) {
  // Ensure database setup and event bus listeners run if needed
  try {
    if (typeof initEventListeners === 'function') {
      initEventListeners();
    }
    setupDatabase();
  } catch (err) {
    if (typeof Logger !== 'undefined' && Logger.log) {
      Logger.log('Setup notice: ' + err.message);
    }
  }

  const template = HtmlService.createTemplateFromFile('Index');
  
  // Set initial page from URL query parameter e.g., ?page=dashboard
  template.initialPage = (e && e.parameter && e.parameter.page) ? e.parameter.page : 'dashboard';
  template.tournamentId = (e && e.parameter && e.parameter.id) ? e.parameter.id : '';

  return template.evaluate()
    .setTitle('Hệ thống Quản lý Giải đấu Thể thao')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Handle incoming POST requests / Webhooks (e.g. Casso / Sepay Payment)
 */
function doPost(e) {
  try {
    let payload = {};
    if (e && e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    }
    const result = getTeamService().handlePaymentWebhook(payload);
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Global helper for including HTML partials inside Index.html
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Server API to initialize or reset database structure
 */
function apiSetupDatabase() {
  return setupDatabase();
}
