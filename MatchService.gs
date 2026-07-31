/**
 * MatchService.gs - Match Scheduling, Fixture Generation (Factory Pattern), Score Management & Bracket Advancement
 */

/**
 * Interface / Base Class for Fixture Generators
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
          let status = 'scheduled';
          let team1Score = '';
          let team2Score = '';
          let notes = '';

          if (isByeMatch) {
            status = 'completed';
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

    const seeds = teams.map(t => t.team_id);
    for (let i = 0; i < numByes; i++) {
      seeds.push('BYE');
    }

    for (let i = 0; i < round1MatchesCount; i++) {
      const team1 = seeds[i * 2] || 'TBD';
      const team2 = seeds[i * 2 + 1] || 'TBD';
      const isByeMatch = (team1 === 'BYE' || team2 === 'BYE');
      
      let status = 'scheduled';
      let winner = '';
      let notes = '';

      if (isByeMatch) {
        status = 'completed';
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
          status: 'scheduled',
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
 * MatchService Class
 */
class MatchService {
  get matchRepo() { return new BaseRepository('Match', 'match_id'); }
  get tsRepo() { return new BaseRepository('TournamentSport', 'ts_id'); }
  get teamRepo() { return new BaseRepository('Team', 'team_id'); }
  get tournamentRepo() { return new BaseRepository('Tournament', 'tournament_id'); }

  /**
   * Generate Fixtures for a TournamentSport
   */
  generateFixtures(tsId, clientEmail) {
    const ts = this.tsRepo.getById(tsId);
    if (!ts) throw new Error('Không tìm thấy thông tin môn thi đấu.');

    getAuthService().checkPermission(ts.tournament_id, ['organizer'], clientEmail);

    const approvedTeams = this.teamRepo.where('ts_id', tsId).filter(t => t.status === 'approved');
    if (approvedTeams.length < Number(ts.min_teams)) {
      throw new Error(`Chưa đủ số lượng đội tối thiểu để sinh lịch thi đấu (${approvedTeams.length}/${ts.min_teams} đội).`);
    }

    this.matchRepo.deleteWhere('ts_id', tsId);

    const generator = FixtureGeneratorFactory.getGenerator(ts.format);
    const matches = generator.generate(tsId, approvedTeams);

    matches.forEach(m => this.matchRepo.insert(m));

    this.tsRepo.update(tsId, { status: 'in_progress' });
    this.tournamentRepo.update(ts.tournament_id, { status: 'in_progress' });

    getRankingService().calculateRankings(tsId);

    if (ts.format === 'single_elimination') {
      const completedByes = matches.filter(m => m.round === 1 && m.status === 'completed' && m.winner_team_id);
      completedByes.forEach(m => this.advanceBracket(m.match_id));
    }

    try {
      getEmailService().sendMatchScheduleNotification(tsId);
    } catch (e) {
      Logger.log('Không thể gửi email lịch thi đấu: ' + e.message);
    }

    return matches;
  }

  /**
   * Update Match Result (Score & Winner)
   */
  updateMatchResult(matchId, team1Score, team2Score, notes, clientEmail) {
    const match = this.matchRepo.getById(matchId);
    if (!match) throw new Error('Không tìm thấy trận đấu.');

    const ts = this.tsRepo.getById(match.ts_id);
    const tournament = this.tournamentRepo.getById(ts.tournament_id);

    if (tournament && (tournament.status === 'completed' || tournament.status === 'cancelled')) {
      throw new Error(`Giải đấu đã ở trạng thái [${tournament.status === 'completed' ? 'Đã kết thúc' : 'Đã hủy'}]. Dữ liệu đã khóa (read-only), không thể chỉnh sửa tỷ số.`);
    }

    if (ts && (ts.status === 'completed' || ts.status === 'cancelled')) {
      throw new Error(`Môn thi đấu này đã ở trạng thái [${ts.status === 'completed' ? 'Đã kết thúc' : 'Đã hủy'}]. Không thể chỉnh sửa tỷ số.`);
    }

    const auth = getAuthService();
    auth.checkPermission(ts.tournament_id, ['organizer', 'referee'], clientEmail);

    const s1 = Number(team1Score);
    const s2 = Number(team2Score);

    if (isNaN(s1) || isNaN(s2)) {
      throw new Error('Vui lòng nhập tỷ số hợp lệ.');
    }

    let winner = '';
    if (s1 > s2) winner = match.team1_id;
    else if (s2 > s1) winner = match.team2_id;
    else winner = 'DRAW';

    if (ts.format === 'single_elimination' && winner === 'DRAW') {
      throw new Error('Thể thức Loại trực tiếp không chấp nhận kết quả Hòa. Vui lòng nhập tỉ số phụ/luân lưu để xác định đội thắng.');
    }

    const updatedUser = auth.getCurrentUserEmail() || clientEmail;

    const updatedMatch = this.matchRepo.update(matchId, {
      team1_score: s1,
      team2_score: s2,
      winner_team_id: winner,
      status: 'completed',
      notes: notes !== undefined ? notes : match.notes,
      updated_by: updatedUser,
      updated_at: new Date().toISOString()
    });

    getRankingService().calculateRankings(match.ts_id);

    if (ts.format === 'single_elimination' && winner !== 'DRAW') {
      this.advanceBracket(matchId);
    }

    return updatedMatch;
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

    if (nextRoundMatches.length === 0) return;

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

// Singleton Helper (global variable for V8 reliability)
let _matchServiceInstance = null;
function getMatchService() {
  if (!_matchServiceInstance) {
    _matchServiceInstance = new MatchService();
  }
  return _matchServiceInstance;
}

/**
 * Server Exposed APIs for Client
 */
function apiGenerateFixtures(tsId, clientEmail) {
  return getMatchService().generateFixtures(tsId, clientEmail);
}

function apiUpdateMatchResult(matchId, team1Score, team2Score, notes, clientEmail) {
  return getMatchService().updateMatchResult(matchId, team1Score, team2Score, notes, clientEmail);
}

function apiGetMatchesByTournamentSport(tsId) {
  return getMatchService().getMatchesByTournamentSport(tsId);
}
