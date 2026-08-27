/**
 * Engine_Football.js - Sport Score Strategy for Football
 * Handles standard goal scoring, tie breaking (extra time / penalty)
 */

class FootballScoreStrategy {
  calculate(match, actionDetails) {
    const s1 = Number(actionDetails.team1_score);
    const s2 = Number(actionDetails.team2_score);

    if (isNaN(s1) || isNaN(s2)) {
      throw new Error('Vui lòng nhập tỷ số bóng đá hợp lệ.');
    }

    let winner = '';
    if (s1 > s2) winner = match.team1_id;
    else if (s2 > s1) winner = match.team2_id;
    else winner = 'DRAW';

    return {
      team1_score: s1,
      team2_score: s2,
      winner_team_id: winner,
      isFinished: true,
      extra_data: actionDetails.extra_data || ''
    };
  }
}

const Engine_Football = new FootballScoreStrategy();
