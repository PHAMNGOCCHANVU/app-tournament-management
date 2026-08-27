/**
 * Mod_BracketEngine.js - Module 3: Algorithmic Fixture & Bracket Tree Generation
 */

/**
 * Base Interface for Fixture Generators
 */
class BaseFixtureGenerator {
  generate(tsId, teams) {
    throw new Error('Hàm generate() cần được ghi đè ở class con.');
  }
}

/**
 * Round Robin Fixture Generator (Circle Method)
 */
class RoundRobinGenerator extends BaseFixtureGenerator {
  generate(tsId, teams) {
    if (teams.length < 2) {
      throw new Error('Cần tối thiểu 2 đội để sinh lịch thi đấu vòng tròn.');
    }

    const teamList = teams.map(t => t.team_id);
    if (teamList.length % 2 !== 0) {
      teamList.push('BYE');
    }

    const numTeams = teamList.length;
    const numRounds = numTeams - 1;
    const matchesPerRound = numTeams / 2;
    const generatedMatches = [];

    const pool = [...teamList];

    for (let r = 0; r < numRounds; r++) {
      const roundNum = r + 1;
      const roundName = `Vòng ${roundNum}`;

      for (let m = 0; m < matchesPerRound; m++) {
        const team1 = pool[m];
        const team2 = pool[numTeams - 1 - m];

        if (team1 !== 'BYE' || team2 !== 'BYE') {
          const isByeMatch = (team1 === 'BYE' || team2 === 'BYE');
          const matchId = generateId('M');

          let winner = '';
          let status = MATCH_STATUS.SCHEDULED;
          let team1Score = '';
          let team2Score = '';
          let notes = '';

          if (isByeMatch) {
            status = MATCH_STATUS.COMPLETED;
            winner = team1 === 'BYE' ? team2 : team1;
            team1Score = team1 === 'BYE' ? 0 : 3;
            team2Score = team2 === 'BYE' ? 0 : 3;
            notes = 'Thắng do đối thủ nghỉ (BYE)';
          }

          generatedMatches.push({
            match_id: matchId,
            ts_id: tsId,
            round: roundNum,
            round_name: roundName,
            group_name: '',
            team1_id: team1,
            team2_id: team2,
            team1_score: team1Score,
            team2_score: team2Score,
            winner_team_id: winner,
            match_date: '',
            location: 'Sân chính',
            status: status,
            notes: notes,
            updated_by: 'System',
            updated_at: new Date().toISOString()
          });
        }
      }

      pool.splice(1, 0, pool.pop());
    }

    return generatedMatches;
  }
}

/**
 * Single Elimination Fixture Generator (Knockout Bracket Tree)
 */
class SingleEliminationGenerator extends BaseFixtureGenerator {
  generate(tsId, teams) {
    if (teams.length < 2) {
      throw new Error('Cần tối thiểu 2 đội để sinh lịch thi đấu loại trực tiếp.');
    }

    const n = teams.length;
    let pow2 = 1;
    while (pow2 < n) pow2 *= 2;

    const numByes = pow2 - n;
    const round1MatchesCount = pow2 / 2;

    const generatedMatches = [];
    const roundNamesMap = {
      1: 'Chung kết',
      2: 'Bán kết',
      4: 'Tứ kết',
      8: 'Vòng 16 đội'
    };

    let tempCount = round1MatchesCount;
    let currentRoundNum = 1;
    const roundCounts = [];

    while (tempCount >= 1) {
      roundCounts.push({
        roundNum: currentRoundNum,
        matchesCount: tempCount,
        name: roundNamesMap[tempCount] || `Vòng ${currentRoundNum}`
      });
      tempCount /= 2;
      currentRoundNum++;
    }

    // Sort seeded teams first if seed > 0
    const sortedTeams = [...teams].sort((a, b) => (Number(a.seed) || 999) - (Number(b.seed) || 999));
    const seeds = sortedTeams.map(t => t.team_id);
    for (let i = 0; i < numByes; i++) {
      seeds.push('BYE');
    }

    for (let i = 0; i < round1MatchesCount; i++) {
      const team1 = seeds[i * 2] || 'TBD';
      const team2 = seeds[i * 2 + 1] || 'TBD';
      const isByeMatch = (team1 === 'BYE' || team2 === 'BYE');
      
      let status = MATCH_STATUS.SCHEDULED;
      let winner = '';
      let notes = '';

      if (isByeMatch) {
        status = MATCH_STATUS.COMPLETED;
        winner = team1 === 'BYE' ? team2 : team1;
        notes = 'Được miễn đấu vòng 1 (BYE)';
      }

      generatedMatches.push({
        match_id: generateId('M'),
        ts_id: tsId,
        round: 1,
        round_name: roundCounts[0].name,
        group_name: '',
        team1_id: team1,
        team2_id: team2,
        team1_score: isByeMatch ? (team1 === 'BYE' ? 0 : 1) : '',
        team2_score: isByeMatch ? (team2 === 'BYE' ? 0 : 1) : '',
        winner_team_id: winner,
        match_date: '',
        location: 'Sân chính',
        status: status,
        notes: notes,
        updated_by: 'System',
        updated_at: new Date().toISOString()
      });
    }

    for (let r = 1; r < roundCounts.length; r++) {
      const rc = roundCounts[r];
      for (let i = 0; i < rc.matchesCount; i++) {
        generatedMatches.push({
          match_id: generateId('M'),
          ts_id: tsId,
          round: rc.roundNum,
          round_name: rc.name,
          group_name: '',
          team1_id: 'TBD',
          team2_id: 'TBD',
          team1_score: '',
          team2_score: '',
          winner_team_id: '',
          match_date: '',
          location: 'Sân chính',
          status: MATCH_STATUS.SCHEDULED,
          notes: '',
          updated_by: 'System',
          updated_at: new Date().toISOString()
        });
      }
    }

    return generatedMatches;
  }
}

/**
 * Fixture Generator Factory Pattern
 */
class FixtureGeneratorFactory {
  static getGenerator(format) {
    switch (format) {
      case 'round_robin':
        return new RoundRobinGenerator();
      case 'single_elimination':
        return new SingleEliminationGenerator();
      default:
        return new RoundRobinGenerator();
    }
  }
}

/**
 * High-level Bracket & Fixture Engine Service
 */
class BracketEngineService {
  get matchRepo() { return new BaseRepository('Match', 'match_id'); }
  get tsRepo() { return new BaseRepository('TournamentSport', 'ts_id'); }
  get teamRepo() { return new BaseRepository('Team', 'team_id'); }
  get tournamentRepo() { return new BaseRepository('Tournament', 'tournament_id'); }

  generateFixtures(tsId) {
    const ts = this.tsRepo.getById(tsId);
    if (!ts) throw new Error('Không tìm thấy thông tin môn thi đấu.');

    getAuthService().checkPermission(ts.tournament_id, ['organizer']);

    const approvedTeams = this.teamRepo.where('ts_id', tsId).filter(t => t.status === TEAM_STATUS.APPROVED);
    if (approvedTeams.length < Number(ts.min_teams)) {
      throw new Error(`Chưa đủ số lượng đội tối thiểu để sinh lịch thi đấu (${approvedTeams.length}/${ts.min_teams} đội).`);
    }

    this.matchRepo.deleteWhere('ts_id', tsId);

    const generator = FixtureGeneratorFactory.getGenerator(ts.format);
    const matches = generator.generate(tsId, approvedTeams);

    // Batch insert for performance
    this.matchRepo.batchInsert(matches);

    this.tsRepo.update(tsId, { status: TOURNAMENT_STATUS.IN_PROGRESS });
    this.tournamentRepo.update(ts.tournament_id, { status: TOURNAMENT_STATUS.IN_PROGRESS });

    getRankingService().calculateRankings(tsId);

    if (ts.format === 'single_elimination') {
      const completedByes = matches.filter(m => m.round === 1 && m.status === MATCH_STATUS.COMPLETED && m.winner_team_id);
      completedByes.forEach(m => getProgressionService().advanceBracket(m.match_id));
    }

    try {
      getEmailService().sendMatchScheduleNotification(tsId);
    } catch (e) {
      if (typeof Logger !== 'undefined' && Logger.log) {
        Logger.log('Không thể gửi email lịch thi đấu: ' + e.message);
      }
    }

    return matches;
  }
}

// Singleton Instance Helper
let _bracketEngineServiceInstance = null;
function getBracketEngineService() {
  if (!_bracketEngineServiceInstance) {
    _bracketEngineServiceInstance = new BracketEngineService();
  }
  return _bracketEngineServiceInstance;
}
