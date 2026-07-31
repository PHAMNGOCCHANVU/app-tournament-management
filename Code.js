/**
 * Code.gs - Entry Point & Router for Apps Script Web App
 */

function doGet(e) {
  // Ensure database setup runs if needed
  try {
    setupDatabase();
  } catch (err) {
    Logger.log('Setup notice: ' + err.message);
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
