/**
 * Engine_Badminton.js - Sport Score Strategy for Badminton & Table Tennis
 * Handles set-based scoring (21 points badminton / 11 points table tennis, best of 3).
 */

class BadmintonScoreStrategy {
  calculate(match, actionDetails) {
    const s1 = Number(actionDetails.team1_score);
    const s2 = Number(actionDetails.team2_score);

    if (isNaN(s1) || isNaN(s2)) {
      throw new Error('Vui lòng nhập điểm số hợp lệ.');
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

const Engine_Badminton = new BadmintonScoreStrategy();
