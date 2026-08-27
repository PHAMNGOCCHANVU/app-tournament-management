/**
 * ApiRouter.js - API Gateway & High-Performance Bundle Endpoints
 * Bundles multi-entity queries into single server round-trips for high-speed UI rendering.
 */

/**
 * Initialize EventBus listeners across all modules
 */
function initEventListeners() {
  clearEventListeners();

  // 1. Match Completed -> Standings & Progression Tracker
  onEvent(SYSTEM_EVENTS.MATCH_COMPLETED, function(payload) {
    getProgressionService().handleMatchCompleted(payload);
  });

  // 2. Match Score Updated -> Firebase Livescore
  onEvent(SYSTEM_EVENTS.MATCH_SCORE_UPDATED, function(payload) {
    getLiveSyncService().syncMatchScore(payload);
  });

  // 3. Tournament Completed -> Archiver
  onEvent(SYSTEM_EVENTS.TOURNAMENT_COMPLETED, function(payload) {
    getArchiverService().handleTournamentCompleted(payload);
  });
}

/**
 * High-Performance Single Round-Trip Bundle API for Tournament Management Room
 */
function apiGetTournamentManageBundle(tournamentId) {
  const auth = getAuthService();
  const authContext = apiGetAuthContext(tournamentId);
  const tournament = getTournamentService().getTournamentById(tournamentId);
  const assignedRoles = auth.getAssignedRoles(tournamentId);

  let firstTsTeams = [];
  if (tournament && tournament.sports && tournament.sports.length > 0) {
    firstTsTeams = getTeamService().getTeamsByTournamentSport(tournament.sports[0].ts_id);
  }

  return {
    authContext: authContext,
    tournament: tournament,
    assignedRoles: assignedRoles,
    firstTsTeams: firstTsTeams
  };
}

/**
 * High-Performance Bundle API for Schedule Page (1 server call instead of 4)
 */
function apiGetSchedulePageBundle(tournamentId, tsId) {
  const auth = getAuthService();
  const email = auth.getCurrentUserEmail();

  const tournamentList = getTournamentService().getTournamentList();
  
  let authContext = null;
  let tournament = null;
  let matches = [];

  if (tournamentId) {
    authContext = apiGetAuthContext(tournamentId, email);
    tournament = getTournamentService().getTournamentById(tournamentId);
    
    // Load matches for the specified or first sport
    const targetTsId = tsId || (tournament && tournament.sports && tournament.sports.length > 0 ? tournament.sports[0].ts_id : '');
    if (targetTsId) {
      matches = getMatchService().getMatchesByTournamentSport(targetTsId);
    }
  }

  return {
    tournamentList: tournamentList,
    authContext: authContext,
    tournament: tournament,
    matches: matches
  };
}

/**
 * High-Performance Bundle API for Ranking Page (1 server call instead of 3)
 */
function apiGetRankingPageBundle(tournamentId, tsId) {
  const tournamentList = getTournamentService().getTournamentList();
  
  let tournament = null;
  let rankings = [];

  if (tournamentId) {
    tournament = getTournamentService().getTournamentById(tournamentId);
    
    const targetTsId = tsId || (tournament && tournament.sports && tournament.sports.length > 0 ? tournament.sports[0].ts_id : '');
    if (targetTsId) {
      rankings = getRankingService().getRankingsByTournamentSport(targetTsId);
    }
  }

  return {
    tournamentList: tournamentList,
    tournament: tournament,
    rankings: rankings
  };
}

/**
 * High-Performance Bundle API for Bracket Page (1 server call instead of 3)
 */
function apiGetBracketPageBundle(tournamentId, tsId) {
  const tournamentList = getTournamentService().getTournamentList();
  
  let tournament = null;
  let matches = [];

  if (tournamentId) {
    tournament = getTournamentService().getTournamentById(tournamentId);
    
    const targetTsId = tsId || (tournament && tournament.sports && tournament.sports.length > 0 
      ? (tournament.sports.find(s => s.format === 'single_elimination') || tournament.sports[0]).ts_id 
      : '');
    if (targetTsId) {
      matches = getMatchService().getMatchesByTournamentSport(targetTsId);
    }
  }

  return {
    tournamentList: tournamentList,
    tournament: tournament,
    matches: matches
  };
}
