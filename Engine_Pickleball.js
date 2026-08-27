/**
 * Engine_Pickleball.js - Sport Score Strategy for Pickleball
 * Handles point scoring (11 points, win by 2), multi-set matches and extra rotation data.
 */

class PickleballScoreStrategy {
  calculate(match, actionDetails) {
    const s1 = Number(actionDetails.team1_score);
    const s2 = Number(actionDetails.team2_score);

    if (isNaN(s1) || isNaN(s2)) {
      throw new Error('Vui lòng nhập điểm Pickleball hợp lệ.');
    }

    let winner = '';
    if (s1 > s2) winner = match.team1_id;
    else if (s2 > s1) winner = match.team2_id;
    else winner = 'DRAW';

    let extraObj = {};
    if (actionDetails.extra_data) {
      if (typeof actionDetails.extra_data === 'string') {
        try { extraObj = JSON.parse(actionDetails.extra_data); } catch (e) { extraObj = { raw: actionDetails.extra_data }; }
      } else {
        extraObj = actionDetails.extra_data;
      }
    }

    return {
      team1_score: s1,
      team2_score: s2,
      winner_team_id: winner,
      isFinished: true,
      extra_data: JSON.stringify(extraObj)
    };
  }
}

const Engine_Pickleball = new PickleballScoreStrategy();
