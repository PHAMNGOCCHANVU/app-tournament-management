/**
 * Mod_Archiver.js - Module 7: Tournament Closer & Archiver (Read-Only Lock & Summary Export)
 */

class ArchiverService {
  get tournamentRepo() { return new BaseRepository('Tournament', 'tournament_id'); }
  get tsRepo() { return new BaseRepository('TournamentSport', 'ts_id'); }
  get matchRepo() { return new BaseRepository('Match', 'match_id'); }
  get rankingRepo() { return new BaseRepository('Ranking', 'ranking_id'); }

  /**
   * Close & Archive Tournament (Locks data to Read-Only)
   */
  closeTournament(tournamentId) {
    getAuthService().checkPermission(tournamentId, ['organizer']);

    const tournament = this.tournamentRepo.getById(tournamentId);
    if (!tournament) throw new Error('Không tìm thấy giải đấu.');

    const updated = this.tournamentRepo.update(tournamentId, {
      status: TOURNAMENT_STATUS.ARCHIVED,
      updated_at: new Date().toISOString()
    });

    const tsList = this.tsRepo.where('tournament_id', tournamentId);
    tsList.forEach(ts => {
      this.tsRepo.update(ts.ts_id, { status: 'completed' });
    });

    return updated;
  }

  /**
   * EventBus Handler: TournamentCompletedEvent listener
   */
  handleTournamentCompleted(payload) {
    if (!payload || !payload.tournamentId) return;

    if (typeof Logger !== 'undefined' && Logger.log) {
      Logger.log(`[Mod_Archiver] Tournament ${payload.tournamentId} completed. Champion: ${payload.championTeamId}`);
    }
  }

  /**
   * Generate tournament summary data
   */
  getTournamentSummary(tournamentId) {
    const tournament = this.tournamentRepo.getById(tournamentId);
    if (!tournament) return null;

    const tsList = this.tsRepo.where('tournament_id', tournamentId);
    const sportsSummary = tsList.map(ts => {
      const matches = this.matchRepo.where('ts_id', ts.ts_id);
      const rankings = this.rankingRepo.where('ts_id', ts.ts_id);
      return {
        ts_id: ts.ts_id,
        format: ts.format,
        total_matches: matches.length,
        completed_matches: matches.filter(m => m.status === MATCH_STATUS.COMPLETED).length,
        rankings: rankings
      };
    });

    return {
      tournament: tournament,
      sports: sportsSummary,
      generated_at: new Date().toISOString()
    };
  }
}

// Singleton Instance Helper
let _archiverServiceInstance = null;
function getArchiverService() {
  if (!_archiverServiceInstance) {
    _archiverServiceInstance = new ArchiverService();
  }
  return _archiverServiceInstance;
}

/**
 * Server Exposed APIs for Client
 */
function apiCloseTournament(tournamentId) {
  return getArchiverService().closeTournament(tournamentId);
}

function apiGetTournamentSummary(tournamentId) {
  return getArchiverService().getTournamentSummary(tournamentId);
}
