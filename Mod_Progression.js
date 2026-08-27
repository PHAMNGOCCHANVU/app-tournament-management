/**
 * Mod_Progression.js - Module 6: Standings & Progression Tracker (Tiebreaker Strategy + Bracket Advancement)
 */

/**
 * Strategy Pattern: Tiebreaker Strategy Interface
 */
class BaseTiebreakerStrategy {
  sort(rankings, matches) {
    throw new Error('Hàm sort() phải được ghi đè ở class con.');
  }
}

/**
 * Default Tiebreaker Strategy
 */
class DefaultTiebreakerStrategy extends BaseTiebreakerStrategy {
  sort(rankings, matches) {
    return rankings.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.goal_difference !== a.goal_difference) return b.goal_difference - a.goal_difference;
      if (b.goals_for !== a.goals_for) return b.goals_for - a.goals_for;

      const h2hMatch = matches.find(m => 
        (m.team1_id === a.team_id && m.team2_id === b.team_id) || 
        (m.team1_id === b.team_id && m.team2_id === a.team_id)
      );

      if (h2hMatch && h2hMatch.status === MATCH_STATUS.COMPLETED && h2hMatch.winner_team_id && h2hMatch.winner_team_id !== 'DRAW') {
        if (h2hMatch.winner_team_id === a.team_id) return -1;
        if (h2hMatch.winner_team_id === b.team_id) return 1;
      }

      return String(a.team_name || '').localeCompare(String(b.team_name || ''));
    });
  }
}

/**
 * Progression & Standings Service
 */
class ProgressionService {
  get rankingRepo() { return new BaseRepository('Ranking', 'ranking_id'); }
  get tsRepo() { return new BaseRepository('TournamentSport', 'ts_id'); }
  get teamRepo() { return new BaseRepository('Team', 'team_id'); }
  get matchRepo() { return new BaseRepository('Match', 'match_id'); }
  get tournamentRepo() { return new BaseRepository('Tournament', 'tournament_id'); }

  get tiebreakerStrategy() {
    if (!this._strategy) this._strategy = new DefaultTiebreakerStrategy();
    return this._strategy;
  }

  /**
   * Calculate and update rankings for a TournamentSport
   */
  calculateRankings(tsId) {
    const ts = this.tsRepo.getById(tsId);
    if (!ts) return [];

    const approvedTeams = this.teamRepo.where('ts_id', tsId).filter(t => t.status === TEAM_STATUS.APPROVED);
    const matches = this.matchRepo.where('ts_id', tsId);
    const completedMatches = matches.filter(m => m.status === MATCH_STATUS.COMPLETED);

    const pointsWin = !isNaN(Number(ts.points_for_win)) ? Number(ts.points_for_win) : 3;
    const pointsDraw = !isNaN(Number(ts.points_for_draw)) ? Number(ts.points_for_draw) : 1;
    const pointsLoss = !isNaN(Number(ts.points_for_loss)) ? Number(ts.points_for_loss) : 0;

    const teamStats = {};
    approvedTeams.forEach(team => {
      teamStats[team.team_id] = {
        ts_id: tsId,
        team_id: team.team_id,
        team_name: team.name,
        group_name: team.group_name || '',
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goals_for: 0,
        goals_against: 0,
        goal_difference: 0,
        points: 0
      };
    });

    completedMatches.forEach(m => {
      const t1 = teamStats[m.team1_id];
      const t2 = teamStats[m.team2_id];

      const s1 = Number(m.team1_score) || 0;
      const s2 = Number(m.team2_score) || 0;

      if (t1) {
        t1.played++;
        t1.goals_for += s1;
        t1.goals_against += s2;
        if (m.winner_team_id === m.team1_id) {
          t1.won++;
          t1.points += pointsWin;
        } else if (m.winner_team_id === 'DRAW') {
          t1.drawn++;
          t1.points += pointsDraw;
        } else {
          t1.lost++;
          t1.points += pointsLoss;
        }
      }

      if (t2) {
        t2.played++;
        t2.goals_for += s2;
        t2.goals_against += s1;
        if (m.winner_team_id === m.team2_id) {
          t2.won++;
          t2.points += pointsWin;
        } else if (m.winner_team_id === 'DRAW') {
          t2.drawn++;
          t2.points += pointsDraw;
        } else {
          t2.lost++;
          t2.points += pointsLoss;
        }
      }
    });

    const rankingArray = Object.values(teamStats).map(stat => {
      stat.goal_difference = stat.goals_for - stat.goals_against;
      return stat;
    });

    const sortedRankings = this.tiebreakerStrategy.sort(rankingArray, matches);

    this.rankingRepo.deleteWhere('ts_id', tsId);

    const finalRankings = sortedRankings.map((stat, idx) => {
      const rankingObj = {
        ranking_id: generateId('R'),
        ts_id: tsId,
        team_id: stat.team_id,
        group_name: stat.group_name,
        played: stat.played,
        won: stat.won,
        drawn: stat.drawn,
        lost: stat.lost,
        goals_for: stat.goals_for,
        goals_against: stat.goals_against,
        goal_difference: stat.goal_difference,
        points: stat.points,
        rank: idx + 1
      };
      this.rankingRepo.insert(rankingObj);
      return Object.assign({}, rankingObj, { team_name: stat.team_name });
    });

    return finalRankings;
  }

  /**
   * Get Current Standings for a TournamentSport
   */
  getRankingsByTournamentSport(tsId) {
    let rankings = this.rankingRepo.where('ts_id', tsId);

    if (rankings.length === 0) {
      return this.calculateRankings(tsId);
    }

    const teams = this.teamRepo.where('ts_id', tsId);

    return rankings.map(r => {
      const team = teams.find(t => t.team_id === r.team_id);
      return Object.assign({}, r, {
        team_name: team ? team.name : r.team_id
      });
    }).sort((a, b) => Number(a.rank) - Number(b.rank));
  }

  /**
   * Advance Winner in Single Elimination Bracket Tree
   */
  advanceBracket(completedMatchId) {
    const match = this.matchRepo.getById(completedMatchId);
    if (!match || !match.winner_team_id) return;

    const allMatches = this.matchRepo.where('ts_id', match.ts_id);
    const currentRoundMatches = allMatches.filter(m => Number(m.round) === Number(match.round))
                                         .sort((a, b) => a.match_id.localeCompare(b.match_id));
    
    const currentMatchIndex = currentRoundMatches.findIndex(m => m.match_id === completedMatchId);
    if (currentMatchIndex === -1) return;

    const nextRoundNumber = Number(match.round) + 1;
    const nextRoundMatches = allMatches.filter(m => Number(m.round) === nextRoundNumber)
                                       .sort((a, b) => a.match_id.localeCompare(b.match_id));

    if (nextRoundMatches.length === 0) {
      // Final Match completed!
      const ts = this.tsRepo.getById(match.ts_id);
      if (ts) {
        emitEvent(SYSTEM_EVENTS.TOURNAMENT_COMPLETED, {
          tournamentId: ts.tournament_id,
          tsId: ts.ts_id,
          championTeamId: match.winner_team_id
        });
      }
      return;
    }

    const targetMatchIndex = Math.floor(currentMatchIndex / 2);
    const targetMatch = nextRoundMatches[targetMatchIndex];
    if (!targetMatch) return;

    const isFirstSlot = (currentMatchIndex % 2 === 0);
    const updateData = {};

    if (isFirstSlot) {
      updateData.team1_id = match.winner_team_id;
    } else {
      updateData.team2_id = match.winner_team_id;
    }

    this.matchRepo.update(targetMatch.match_id, updateData);
  }

  /**
   * EventBus Handler: MatchCompletedEvent listener
   */
  handleMatchCompleted(payload) {
    if (!payload || !payload.tsId) return;

    // 1. Recalculate standings
    this.calculateRankings(payload.tsId);

    // 2. If single elimination, advance bracket
    if (payload.format === 'single_elimination' && payload.matchId) {
      this.advanceBracket(payload.matchId);
    }
  }
}

// Singleton Instance Helper
let _progressionServiceInstance = null;
function getProgressionService() {
  if (!_progressionServiceInstance) {
    _progressionServiceInstance = new ProgressionService();
  }
  return _progressionServiceInstance;
}

// Backward compatibility helper
function getRankingService() {
  return getProgressionService();
}

/**
 * Server Exposed APIs for Client
 */
function apiCalculateRankings(tsId) {
  return getProgressionService().calculateRankings(tsId);
}

function apiGetRankingsByTournamentSport(tsId) {
  return getProgressionService().getRankingsByTournamentSport(tsId);
}
