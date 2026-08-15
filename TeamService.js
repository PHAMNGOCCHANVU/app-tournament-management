/**
 * TeamService.gs - Team Registration, Roster Management & Approval Workflow
 */

class TeamService {
  get teamRepo() { return new BaseRepository('Team', 'team_id'); }
  get playerRepo() { return new BaseRepository('Player', 'player_id'); }
  get tsRepo() { return new BaseRepository('TournamentSport', 'ts_id'); }
  get sportRepo() { return new BaseRepository('Sport', 'sport_id'); }
  get tournamentRepo() { return new BaseRepository('Tournament', 'tournament_id'); }

  normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
  }

  isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
  }

  validateRegistrationDeadline(tournamentSport) {
    if (!tournamentSport || !tournamentSport.registration_deadline) {
      return;
    }

    const deadline = new Date(tournamentSport.registration_deadline);
    if (Number.isNaN(deadline.getTime())) {
      return;
    }

    if (new Date() > deadline) {
      throw new Error(`Đăng ký đã hết hạn theo thời hạn của môn thi đấu (${tournamentSport.registration_deadline}).`);
    }
  }

  validateUniqueJerseyNumbers(players) {
    const jerseyMap = {};
    players.forEach((player, index) => {
      if (player && player.jersey_number !== undefined && player.jersey_number !== null && String(player.jersey_number).trim() !== '') {
        const jerseyNumber = String(player.jersey_number).trim();
        if (!jerseyMap[jerseyNumber]) {
          jerseyMap[jerseyNumber] = index + 1;
        } else {
          throw new Error(`Số áo ${jerseyNumber} bị trùng trong cùng đội (thành viên ${index + 1}).`);
        }
      }
    });
  }

  validateRoster(players, sport, tournamentSport) {
    if (!Array.isArray(players)) {
      throw new Error('Danh sách thành viên không hợp lệ.');
    }

    if (players.length === 0) {
      throw new Error('Đội phải có ít nhất 1 thành viên.');
    }

    const sportName = sport ? String(sport.name || '').trim() : '';
    const categoryText = tournamentSport ? String(tournamentSport.category || '').trim() : '';
    const skillLevelText = tournamentSport ? String(tournamentSport.skill_level || '').trim() : '';

    players.forEach((player, index) => {
      if (!player || typeof player !== 'object') {
        throw new Error(`Thành viên thứ ${index + 1} không hợp lệ.`);
      }

      const name = String(player.name || '').trim();
      if (!name) {
        throw new Error(`Tên thành viên thứ ${index + 1} không được để trống.`);
      }

      const email = String(player.email || '').trim();
      if (email && !this.isValidEmail(email)) {
        throw new Error(`Email thành viên thứ ${index + 1} không hợp lệ.`);
      }

      const gender = String(player.gender || '').trim();
      if (gender) {
        const normalizedGender = gender.toLowerCase();
        const validGenders = ['male', 'female', 'other', 'nam', 'nu', 'nữ', 'khác', 'unknown'];
        if (!validGenders.includes(normalizedGender)) {
          throw new Error(`Giới tính của thành viên thứ ${index + 1} không hợp lệ: ${player.gender}`);
        }
      }

      const position = String(player.position || '').trim();
      if (position) {
        // TODO: AS04 rule chưa được đặc tả đầy đủ cho position theo từng môn; giữ kiểm tra ở mức an toàn và không suy diễn thêm.
        if (position.length < 2) {
          throw new Error(`Vị trí của thành viên thứ ${index + 1} không hợp lệ.`);
        }
      }

      const roleInTeam = String(player.role_in_team || '').trim();
      if (roleInTeam) {
        const validRoles = ['captain', 'player', 'coach', 'manager'];
        if (!validRoles.includes(roleInTeam.toLowerCase())) {
          throw new Error(`Vai trò trong đội của thành viên thứ ${index + 1} không hợp lệ: ${player.role_in_team}`);
        }
      }

      const jerseyNumber = player.jersey_number;
      if (jerseyNumber !== undefined && jerseyNumber !== null && String(jerseyNumber).trim() !== '') {
        const numericValue = Number(jerseyNumber);
        if (!Number.isFinite(numericValue) || numericValue < 0) {
          throw new Error(`Số áo của thành viên thứ ${index + 1} không hợp lệ.`);
        }
      }
    });

    this.validateUniqueJerseyNumbers(players);

    const mixedLayout =
      categoryText.toLowerCase().includes('mixed') ||
      skillLevelText.toLowerCase().includes('mixed') ||
      sportName.toLowerCase().includes('mixed');

    if (mixedLayout && players.length === 2) {
      const validGenders = players
        .map(player => String(player.gender || '').trim().toLowerCase())
        .filter(Boolean);

      if (validGenders.length === 2) {
        const isMalePair = validGenders.every(gender => ['male', 'nam'].includes(gender));
        const isFemalePair = validGenders.every(gender => ['female', 'nu', 'nữ'].includes(gender));

        if (isMalePair || isFemalePair) {
          // TODO: AS04 rule chưa được đặc tả đầy đủ cho mọi định dạng mixed doubles; chỉ chặn ví dụ "2 nam" / "2 nữ" đã nêu rõ trong tài liệu.
          throw new Error('Mixed doubles không hợp lệ nếu cả hai thành viên cùng giới tính (ví dụ 2 nam hoặc 2 nữ).');
        }
      }
    }
  }

  /**
   * Register a new Team or Individual Participant
   */
  registerTeam(data) {
    const auth = getAuthService();
    let userEmail = auth.getCurrentUserEmail();

    if (!userEmail && data && data.captain_email) {
      userEmail = this.normalizeEmail(data.captain_email);
    }

    if (!userEmail) {
      throw new Error('Vui lòng nhập Email Đội trưởng / Người đại diện để đăng ký.');
    }

    if (!data || !data.ts_id || !String(data.name || '').trim()) {
      throw new Error('Vui lòng nhập tên đội và chọn môn thi đấu.');
    }

    const ts = this.tsRepo.getById(data.ts_id);
    if (!ts) {
      throw new Error('Không tìm thấy thông tin môn thi đấu trong giải.');
    }

    const sport = this.sportRepo.getById(ts.sport_id);
    if (!sport) {
      throw new Error('Không tìm thấy thông tin môn thi đấu tương ứng trong hệ thống.');
    }

    if (ts.status !== 'open') {
      throw new Error('Môn thi đấu này đã đóng đăng ký.');
    }

    this.validateRegistrationDeadline(ts);

    const existingTeams = this.teamRepo.where('ts_id', data.ts_id);
    const duplicate = existingTeams.find(t =>
      String(t.name || '').toLowerCase().trim() === String(data.name || '').toLowerCase().trim() &&
      ['pending', 'approved', 'rejected', 'withdrawn'].includes(String(t.status || '').toLowerCase())
    );

    if (duplicate) {
      throw new Error(`Tên đội "${data.name}" đã tồn tại trong môn thi đấu này.`);
    }

    const approvedOrPending = existingTeams.filter(t => ['approved', 'pending'].includes(String(t.status || '').toLowerCase()));
    if (approvedOrPending.length >= Number(ts.max_teams)) {
      throw new Error(`Môn thi đấu đã đạt số lượng đội tối đa (${ts.max_teams} đội).`);
    }

    const playersList = Array.isArray(data.players) ? data.players : [];
    if (sport) {
      if (playersList.length < Number(sport.min_players_per_team)) {
        throw new Error(`Số lượng thành viên tối thiểu cho môn ${sport.name} là ${sport.min_players_per_team} người.`);
      }
      if (playersList.length > Number(sport.max_players_per_team)) {
        throw new Error(`Số lượng thành viên tối đa cho môn ${sport.name} là ${sport.max_players_per_team} người.`);
      }
    }

    this.validateRoster(playersList, sport, ts);

    const captainEmail = this.normalizeEmail(data.captain_email || userEmail);
    if (!this.isValidEmail(captainEmail)) {
      throw new Error('Email Đội trưởng / Người đại diện không hợp lệ.');
    }

    const teamId = generateId('TM');
    const roleInTournament = auth.getUserRole(ts.tournament_id, userEmail);
    const initialStatus = (roleInTournament === 'organizer') ? 'approved' : 'pending';

    const newTeam = {
      team_id: teamId,
      ts_id: data.ts_id,
      name: String(data.name).trim(),
      captain_email: captainEmail,
      registration_date: new Date().toISOString(),
      status: initialStatus,
      group_name: data.group_name || '',
      seed: Number(data.seed) || 0
    };

    this.teamRepo.insert(newTeam);

    playersList.forEach((p, idx) => {
      const playerId = generateId('P');
      const playerEmail = p.email ? this.normalizeEmail(p.email) : (idx === 0 ? captainEmail : '');

      this.playerRepo.insert({
        player_id: playerId,
        team_id: teamId,
        name: String(p.name || '').trim() || `Thành viên ${idx + 1}`,
        email: playerEmail,
        phone: String(p.phone || '').trim(),
        gender: String(p.gender || '').trim(),
        jersey_number: p.jersey_number !== undefined && p.jersey_number !== null && String(p.jersey_number).trim() !== ''
          ? Number(p.jersey_number)
          : (idx + 1),
        position: String(p.position || '').trim(),
        role_in_team: idx === 0 ? 'captain' : (String(p.role_in_team || 'player').trim() || 'player')
      });
    });

    try {
      getEmailService().sendRegistrationConfirmation(teamId);
    } catch (e) {
      Logger.log('Không thể gửi email xác nhận: ' + e.message);
    }

    return newTeam;
  }

  /**
   * Approve team registration (Organizer only)
   */
  approveTeam(teamId) {
    const team = this.teamRepo.getById(teamId);
    if (!team) throw new Error('Không tìm thấy thông tin đội.');

    const ts = this.tsRepo.getById(team.ts_id);
    const auth = getAuthService();
    auth.checkPermission(ts.tournament_id, ['organizer']);

    const updated = this.teamRepo.update(teamId, { status: 'approved' });

    return updated;
  }

  /**
   * Reject team registration (Organizer only)
   */
  rejectTeam(teamId) {
    const team = this.teamRepo.getById(teamId);
    if (!team) throw new Error('Không tìm thấy thông tin đội.');

    const ts = this.tsRepo.getById(team.ts_id);
    getAuthService().checkPermission(ts.tournament_id, ['organizer']);

    return this.teamRepo.update(teamId, { status: 'rejected' });
  }

  /**
   * Withdraw team registration
   */
  withdrawTeam(teamId) {
    const team = this.teamRepo.getById(teamId);
    if (!team) throw new Error('Không tìm thấy thông tin đội.');

    const ts = this.tsRepo.getById(team.ts_id);
    const auth = getAuthService();
    let currentUser = auth.getCurrentUserEmail();
    const role = auth.getUserRole(ts.tournament_id, currentUser);

    if (role !== 'organizer' && currentUser && currentUser.toLowerCase() !== String(team.captain_email).toLowerCase()) {
      throw new Error('Chỉ có Đội trưởng hoặc Ban tổ chức mới có quyền rút đăng ký.');
    }

    const updated = this.teamRepo.update(teamId, { status: 'withdrawn' });

    // If matches already exist, mark future matches as cancelled/walkover
    const matchRepo = new BaseRepository('Match', 'match_id');
    const matches = matchRepo.where('ts_id', team.ts_id);
    matches.forEach(m => {
      if (m.status === 'scheduled') {
        if (m.team1_id === teamId) {
          matchRepo.update(m.match_id, { status: 'cancelled', winner_team_id: m.team2_id, notes: 'Đội 1 rút lui' });
        } else if (m.team2_id === teamId) {
          matchRepo.update(m.match_id, { status: 'cancelled', winner_team_id: m.team1_id, notes: 'Đội 2 rút lui' });
        }
      }
    });

    return updated;
  }

  /**
   * Get all teams for a TournamentSport with members list
   */
  getTeamsByTournamentSport(tsId) {
    const teams = this.teamRepo.where('ts_id', tsId);
    const allPlayers = this.playerRepo.getAll();

    return teams.map(t => {
      const roster = allPlayers.filter(p => p.team_id === t.team_id);
      return Object.assign({}, t, { players: roster });
    });
  }

  /**
   * Get single team by ID with members list
   */
  getTeamById(teamId) {
    const team = this.teamRepo.getById(teamId);
    if (!team) return null;

    const players = this.playerRepo.where('team_id', teamId);
    return Object.assign({}, team, { players: players });
  }
}

// Singleton Helper (global variable for V8 reliability)
let _teamServiceInstance = null;
function getTeamService() {
  if (!_teamServiceInstance) {
    _teamServiceInstance = new TeamService();
  }
  return _teamServiceInstance;
}

/**
 * Server Exposed APIs for Client
 */
function apiRegisterTeam(data) {
  return getTeamService().registerTeam(data);
}

function apiApproveTeam(teamId) {
  return getTeamService().approveTeam(teamId);
}

function apiRejectTeam(teamId) {
  return getTeamService().rejectTeam(teamId);
}

function apiWithdrawTeam(teamId) {
  return getTeamService().withdrawTeam(teamId);
}

function apiGetTeamsByTournamentSport(tsId) {
  return getTeamService().getTeamsByTournamentSport(tsId);
}

function apiGetTeamById(teamId) {
  return getTeamService().getTeamById(teamId);
}
