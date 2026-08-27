/**
 * Mod_MatchControl.js - Module 4: Match Operations, Control & State Machine Enforcement
 */

class MatchControlService {
  get matchRepo() { return new BaseRepository('Match', 'match_id'); }
  get tsRepo() { return new BaseRepository('TournamentSport', 'ts_id'); }
  get teamRepo() { return new BaseRepository('Team', 'team_id'); }
  get tournamentRepo() { return new BaseRepository('Tournament', 'tournament_id'); }

  /**
   * Update Match Result (Score & Winner) via Score Engine
   */
  updateMatchResult(matchId, team1Score, team2Score, notes, extraData) {
    const match = this.matchRepo.getById(matchId);
    if (!match) throw new Error('Không tìm thấy trận đấu.');

    const ts = this.tsRepo.getById(match.ts_id);
    const tournament = ts ? this.tournamentRepo.getById(ts.tournament_id) : null;

    if (tournament && (tournament.status === TOURNAMENT_STATUS.COMPLETED || tournament.status === TOURNAMENT_STATUS.ARCHIVED || tournament.status === TOURNAMENT_STATUS.CANCELLED)) {
      throw new Error(`Giải đấu đã ở trạng thái [${tournament.status === TOURNAMENT_STATUS.COMPLETED ? 'Đã kết thúc' : 'Đã khóa/hủy'}]. Dữ liệu đã khóa (read-only), không thể chỉnh sửa tỷ số.`);
    }

    if (ts && (ts.status === 'completed' || ts.status === 'cancelled')) {
      throw new Error(`Môn thi đấu này đã ở trạng thái [${ts.status === 'completed' ? 'Đã kết thúc' : 'Đã hủy'}]. Không thể chỉnh sửa tỷ số.`);
    }

    const auth = getAuthService();
    auth.checkPermission(ts.tournament_id, ['organizer', 'referee']);

    return getScoreEngineService().processScoreAction(matchId, {
      team1_score: team1Score,
      team2_score: team2Score,
      notes: notes,
      extra_data: extraData
    });
  }

  /**
   * Transition Match State: Start Match (SCHEDULED -> ONGOING)
   */
  startMatch(matchId) {
    const match = this.matchRepo.getById(matchId);
    if (!match) throw new Error('Không tìm thấy trận đấu.');

    const ts = this.tsRepo.getById(match.ts_id);
    getAuthService().checkPermission(ts.tournament_id, ['organizer', 'referee']);

    return this.matchRepo.update(matchId, {
      status: MATCH_STATUS.ONGOING,
      updated_at: new Date().toISOString()
    });
  }

  /**
   * Transition Match State: Waiting Confirmation (ONGOING -> WAITING_CONFIRMATION)
   */
  submitForConfirmation(matchId) {
    const match = this.matchRepo.getById(matchId);
    if (!match) throw new Error('Không tìm thấy trận đấu.');

    const ts = this.tsRepo.getById(match.ts_id);
    getAuthService().checkPermission(ts.tournament_id, ['organizer', 'referee']);

    return this.matchRepo.update(matchId, {
      status: MATCH_STATUS.WAITING_CONFIRMATION,
      updated_at: new Date().toISOString()
    });
  }

  /**
   * Get Matches for a TournamentSport joined with team names
   */
  getMatchesByTournamentSport(tsId) {
    const matches = this.matchRepo.where('ts_id', tsId);
    const teams = this.teamRepo.where('ts_id', tsId);

    const getTeamName = (id) => {
      if (id === 'BYE') return 'Nghỉ (BYE)';
      if (id === 'TBD') return 'Chưa xác định';
      const team = teams.find(t => t.team_id === id);
      return team ? team.name : id;
    };

    return matches.map(m => Object.assign({}, m, {
      team1_name: getTeamName(m.team1_id),
      team2_name: getTeamName(m.team2_id),
      winner_team_name: getTeamName(m.winner_team_id)
    })).sort((a, b) => Number(a.round) - Number(b.round));
  }
}

// Singleton Instance Helper
let _matchControlServiceInstance = null;
function getMatchControlService() {
  if (!_matchControlServiceInstance) {
    _matchControlServiceInstance = new MatchControlService();
  }
  return _matchControlServiceInstance;
}

// Wrapper for backward-compatible getMatchService()
class MatchServiceCompat {
  generateFixtures(tsId) {
    return getBracketEngineService().generateFixtures(tsId);
  }
  updateMatchResult(matchId, team1Score, team2Score, notes) {
    return getMatchControlService().updateMatchResult(matchId, team1Score, team2Score, notes);
  }
  advanceBracket(matchId) {
    return getProgressionService().advanceBracket(matchId);
  }
  getMatchesByTournamentSport(tsId) {
    return getMatchControlService().getMatchesByTournamentSport(tsId);
  }
}

let _matchServiceInstance = null;
function getMatchService() {
  if (!_matchServiceInstance) {
    _matchServiceInstance = new MatchServiceCompat();
  }
  return _matchServiceInstance;
}

/**
 * Server Exposed APIs for Client
 */
function apiGenerateFixtures(tsId) {
  return getBracketEngineService().generateFixtures(tsId);
}

function apiUpdateMatchResult(matchId, team1Score, team2Score, notes) {
  return getMatchControlService().updateMatchResult(matchId, team1Score, team2Score, notes);
}

function apiGetMatchesByTournamentSport(tsId) {
  return getMatchControlService().getMatchesByTournamentSport(tsId);
}

function apiStartMatch(matchId) {
  return getMatchControlService().startMatch(matchId);
}

function apiSubmitForConfirmation(matchId) {
  return getMatchControlService().submitForConfirmation(matchId);
}
