/**
 * Mod_ScoreEngine.js - Module 5: Sport Score Strategy Engine (Strategy Pattern)
 */

class ScoreEngineService {
  get matchRepo() { return new BaseRepository('Match', 'match_id'); }
  get tsRepo() { return new BaseRepository('TournamentSport', 'ts_id'); }
  get sportRepo() { return new BaseRepository('Sport', 'sport_id'); }
  get scoreRepo() { return new BaseRepository('SportScore', 'match_id'); }

  /**
   * Get corresponding score engine based on sport type
   */
  getEngine(sportNameOrType) {
    const type = String(sportNameOrType || '').toUpperCase();
    if (type.includes('PICKLEBALL') || type.includes('PADDLE')) {
      return Engine_Pickleball;
    } else if (type.includes('FOOTBALL') || type.includes('BÓNG ĐÁ')) {
      return Engine_Football;
    } else if (type.includes('BADMINTON') || type.includes('CẦU LÔNG') || type.includes('BÓNG BÀN') || type.includes('TABLE_TENNIS') || type.includes('RACKET')) {
      return Engine_Badminton;
    }
    return Engine_Football; // default fallback
  }

  /**
   * Process score action using Sport Strategy
   */
  processScoreAction(matchId, actionDetails) {
    if (typeof initEventListeners === 'function') {
      initEventListeners();
    }

    const match = this.matchRepo.getById(matchId);
    if (!match) throw new Error('Không tìm thấy trận đấu.');

    const ts = this.tsRepo.getById(match.ts_id);
    const sport = ts ? this.sportRepo.getById(ts.sport_id) : null;
    const sportType = sport ? (sport.name || sport.type) : 'Football';

    const engine = this.getEngine(sportType);
    const scoreResult = engine.calculate(match, actionDetails);

    if (ts && ts.format === 'single_elimination' && scoreResult.winner_team_id === 'DRAW') {
      throw new Error('Thể thức Loại trực tiếp không chấp nhận kết quả Hòa. Vui lòng nhập tỉ số phụ/luân lưu để xác định đội thắng.');
    }

    // Update Match Table
    const auth = getAuthService();
    const updatedUser = auth.getCurrentUserEmail();

    const updateFields = {
      team1_score: scoreResult.team1_score,
      team2_score: scoreResult.team2_score,
      winner_team_id: scoreResult.winner_team_id,
      status: scoreResult.isFinished ? MATCH_STATUS.COMPLETED : MATCH_STATUS.ONGOING,
      notes: actionDetails.notes !== undefined ? actionDetails.notes : match.notes,
      updated_by: updatedUser,
      updated_at: new Date().toISOString()
    };

    const updatedMatch = this.matchRepo.update(matchId, updateFields);

    // Save detailed scores to SportScore sheet if extra data is present
    if (scoreResult.extra_data) {
      let extraObj = {};
      try {
        extraObj = typeof scoreResult.extra_data === 'string' ? JSON.parse(scoreResult.extra_data) : scoreResult.extra_data;
      } catch (e) {}

      if (extraObj && typeof extraObj === 'object') {
        if (extraObj.sets && typeof extraObj.sets === 'object') {
          extraObj = Object.assign({}, extraObj.sets, extraObj);
        }
      } else {
        extraObj = {};
      }

      const existingScore = this.scoreRepo.getById(matchId);
      const scoreData = {
        match_id: matchId,
        sport_type: sportType,
        set1_a: extraObj.set1_a !== undefined ? extraObj.set1_a : '',
        set1_b: extraObj.set1_b !== undefined ? extraObj.set1_b : '',
        set2_a: extraObj.set2_a !== undefined ? extraObj.set2_a : '',
        set2_b: extraObj.set2_b !== undefined ? extraObj.set2_b : '',
        set3_a: extraObj.set3_a !== undefined ? extraObj.set3_a : '',
        set3_b: extraObj.set3_b !== undefined ? extraObj.set3_b : '',
        extra_data: typeof scoreResult.extra_data === 'object' ? JSON.stringify(scoreResult.extra_data) : scoreResult.extra_data,
        updated_at: new Date().toISOString()
      };
      if (existingScore) {
        this.scoreRepo.update(matchId, scoreData);
      } else {
        this.scoreRepo.insert(scoreData);
      }
    }

    // Emit Realtime Event for Livescore
    emitEvent(SYSTEM_EVENTS.MATCH_SCORE_UPDATED, {
      matchId: matchId,
      tsId: match.ts_id,
      tournamentId: ts ? ts.tournament_id : '',
      match: updatedMatch
    });

    // If match finished, emit MatchCompletedEvent for Progression & Standings
    if (scoreResult.isFinished) {
      emitEvent(SYSTEM_EVENTS.MATCH_COMPLETED, {
        matchId: matchId,
        tsId: match.ts_id,
        winnerId: scoreResult.winner_team_id,
        match: updatedMatch,
        format: ts ? ts.format : 'round_robin'
      });
    }

    return updatedMatch;
  }
}

// Singleton Instance Helper
let _scoreEngineServiceInstance = null;
function getScoreEngineService() {
  if (!_scoreEngineServiceInstance) {
    _scoreEngineServiceInstance = new ScoreEngineService();
  }
  return _scoreEngineServiceInstance;
}
