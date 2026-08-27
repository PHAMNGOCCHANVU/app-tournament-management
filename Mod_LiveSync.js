/**
 * Mod_LiveSync.js - Real-time Live Score Synchronization to Firebase Realtime Database
 * Provides non-blocking cache updates for public viewer traffic without loading Google Sheets.
 */

class LiveSyncService {
  /**
   * Sync score update to Firebase Realtime Database
   */
  syncMatchScore(payload) {
    const fbConfig = getFirebaseConfig();
    if (!fbConfig.ENABLED || !fbConfig.DATABASE_URL) {
      return; // Graceful skip if Firebase is not configured
    }

    try {
      const match = payload.match;
      const tournamentId = payload.tournamentId;
      const matchId = payload.matchId;

      let endpoint = `${fbConfig.DATABASE_URL}/tournaments/${tournamentId}/matches/${matchId}.json`;
      if (fbConfig.SECRET) {
        endpoint += `?auth=${encodeURIComponent(fbConfig.SECRET)}`;
      }

      const data = {
        match_id: match.match_id,
        team1_id: match.team1_id,
        team2_id: match.team2_id,
        team1_score: match.team1_score,
        team2_score: match.team2_score,
        winner_team_id: match.winner_team_id,
        status: match.status,
        updated_at: new Date().toISOString()
      };

      if (typeof UrlFetchApp !== 'undefined') {
        UrlFetchApp.fetch(endpoint, {
          method: 'put',
          contentType: 'application/json',
          payload: JSON.stringify(data),
          muteHttpExceptions: true
        });
      }
    } catch (err) {
      if (typeof Logger !== 'undefined' && Logger.log) {
        Logger.log(`[Mod_LiveSync] Firebase push error: ${err.message}`);
      }
    }
  }
}

// Singleton Instance Helper
let _liveSyncServiceInstance = null;
function getLiveSyncService() {
  if (!_liveSyncServiceInstance) {
    _liveSyncServiceInstance = new LiveSyncService();
  }
  return _liveSyncServiceInstance;
}
