/**
 * Mod_Registration.js - Module 2: Team Registration, Roster Management & Payment Webhook
 */

class RegistrationService {
  get teamRepo() { return new BaseRepository('Team', 'team_id'); }
  get playerRepo() { return new BaseRepository('Player', 'player_id'); }
  get tsRepo() { return new BaseRepository('TournamentSport', 'ts_id'); }
  get sportRepo() { return new BaseRepository('Sport', 'sport_id'); }
  get tournamentRepo() { return new BaseRepository('Tournament', 'tournament_id'); }

  /**
   * Register a new Team or Individual Participant
   */
  registerTeam(data) {
    const auth = getAuthService();
    let userEmail = auth.getCurrentUserEmail();
    
    // Fallback: If Session email is masked, use captain_email from form input
    if (!userEmail && data.captain_email) {
      userEmail = String(data.captain_email).toLowerCase().trim();
    }

    if (!userEmail) {
      throw new Error('Vui lòng nhập Email Đội trưởng / Người đại diện để đăng ký.');
    }

    if (!data.ts_id || !data.name) {
      throw new Error('Vui lòng nhập tên đội và chọn môn thi đấu.');
    }

    const ts = this.tsRepo.getById(data.ts_id);
    if (!ts) throw new Error('Không tìm thấy thông tin môn thi đấu trong giải.');
    if (ts.status !== 'open') {
      throw new Error('Môn thi đấu này đã đóng đăng ký.');
    }

    // Check duplicate team name in same TournamentSport
    const existingTeams = this.teamRepo.where('ts_id', data.ts_id);
    const duplicate = existingTeams.find(t => 
      t.name.toLowerCase().trim() === data.name.toLowerCase().trim() && 
      t.status !== TEAM_STATUS.WITHDRAWN && t.status !== TEAM_STATUS.REJECTED
    );
    if (duplicate) {
      throw new Error(`Tên đội "${data.name}" đã tồn tại trong môn thi đấu này.`);
    }

    // Check maximum teams limit
    const approvedOrPending = existingTeams.filter(t => [TEAM_STATUS.APPROVED, TEAM_STATUS.PENDING].includes(t.status));
    if (approvedOrPending.length >= Number(ts.max_teams)) {
      throw new Error(`Môn thi đấu đã đạt số lượng đội tối đa (${ts.max_teams} đội).`);
    }

    // Validate min/max players from Sport configuration
    const sport = this.sportRepo.getById(ts.sport_id);
    const playersList = Array.isArray(data.players) ? data.players : [];
    
    if (sport) {
      if (playersList.length < Number(sport.min_players_per_team)) {
        throw new Error(`Số lượng thành viên tối thiểu cho môn ${sport.name} là ${sport.min_players_per_team} người.`);
      }
      if (playersList.length > Number(sport.max_players_per_team)) {
        throw new Error(`Số lượng thành viên tối đa cho môn ${sport.name} là ${sport.max_players_per_team} người.`);
      }
    }

    // Category gender validation
    const category = ts.category || '';
    if (category.startsWith('mens_') || category === 'mens') {
      const invalid = playersList.find(p => p.gender && p.gender !== 'male');
      if (invalid) throw new Error(`Hạng mục Đôi Nam / Đơn Nam chỉ dành cho VĐV Nam.`);
    } else if (category.startsWith('womens_') || category === 'womens') {
      const invalid = playersList.find(p => p.gender && p.gender !== 'female');
      if (invalid) throw new Error(`Hạng mục Đôi Nữ / Đơn Nữ chỉ dành cho VĐV Nữ.`);
    } else if (category === 'mixed_doubles' || category === 'mixed') {
      if (playersList.length === 2) {
        const males = playersList.filter(p => p.gender === 'male').length;
        const females = playersList.filter(p => p.gender === 'female').length;
        if (males !== 1 || females !== 1) {
          throw new Error(`Hạng mục Đôi Nam Nữ phải gồm đúng 1 Nam và 1 Nữ.`);
        }
      }
    }

    // Position rules validation (e.g. Football requires goalkeeper)
    if (sport && sport.position_rules) {
      try {
        const rules = typeof sport.position_rules === 'string' ? JSON.parse(sport.position_rules) : sport.position_rules;
        if (rules && rules.goalkeeper && rules.goalkeeper.min) {
          const gkCount = playersList.filter(p => p.position === 'goalkeeper').length;
          if (gkCount < rules.goalkeeper.min) {
            throw new Error(`Đội thi đấu môn ${sport.name} bắt buộc phải có ít nhất ${rules.goalkeeper.min} Thủ môn (Goalkeeper).`);
          }
        }
      } catch (e) {
        if (e.message.includes('bắt buộc')) throw e;
      }
    }

    // Unique Jersey Number validation
    const jerseys = playersList.map(p => String(p.jersey_number || '').trim()).filter(j => j !== '');
    const uniqueJerseys = new Set(jerseys);
    if (uniqueJerseys.size < jerseys.length) {
      throw new Error(`Số áo của các thành viên trong đội không được trùng nhau.`);
    }

    const captainEmail = data.captain_email || userEmail;
    const teamId = generateId('TM');
    const roleInTournament = auth.getUserRole(ts.tournament_id, userEmail);

    // Auto approve if registered by organizer
    const initialStatus = (roleInTournament === 'organizer') ? TEAM_STATUS.APPROVED : TEAM_STATUS.PENDING;

    const newTeam = {
      team_id: teamId,
      ts_id: data.ts_id,
      name: data.name,
      captain_email: captainEmail,
      registration_date: new Date().toISOString(),
      status: initialStatus,
      group_name: data.group_name || '',
      seed: Number(data.seed) || 0
    };

    this.teamRepo.insert(newTeam);

    // Save team players roster
    playersList.forEach((p, idx) => {
      const playerId = generateId('P');
      this.playerRepo.insert({
        player_id: playerId,
        team_id: teamId,
        name: p.name || `Thành viên ${idx + 1}`,
        email: p.email || (idx === 0 ? captainEmail : ''),
        phone: p.phone || '',
        jersey_number: p.jersey_number || (idx + 1),
        role_in_team: idx === 0 ? 'captain' : (p.role_in_team || 'player'),
        gender: p.gender || '',
        position: p.position || ''
      });
    });

    // Auto assign roles if approved
    if (initialStatus === TEAM_STATUS.APPROVED) {
      auth.assignRole(ts.tournament_id, captainEmail, 'player', userEmail);
    }

    // Send confirmation email
    try {
      getEmailService().sendRegistrationConfirmation(teamId);
    } catch (e) {
      if (typeof Logger !== 'undefined' && Logger.log) {
        Logger.log('Không thể gửi email xác nhận: ' + e.message);
      }
    }

    return newTeam;
  }

  /**
   * Approve team registration (Organizer only or System Webhook)
   */
  approveTeam(teamId, bypassAuth = false) {
    const team = this.teamRepo.getById(teamId);
    if (!team) throw new Error('Không tìm thấy thông tin đội.');

    const ts = this.tsRepo.getById(team.ts_id);
    const auth = getAuthService();
    if (!bypassAuth) {
      auth.checkPermission(ts.tournament_id, ['organizer']);
    }

    const updated = this.teamRepo.update(teamId, { status: TEAM_STATUS.APPROVED });

    const players = this.playerRepo.where('team_id', teamId);
    const userEmail = (bypassAuth ? '' : auth.getCurrentUserEmail()) || team.captain_email;
    
    auth.assignRole(ts.tournament_id, team.captain_email, 'player', userEmail);
    players.forEach(p => {
      if (p.email) {
        auth.assignRole(ts.tournament_id, p.email, 'player', userEmail);
      }
    });

    emitEvent(SYSTEM_EVENTS.TEAM_APPROVED, { teamId: teamId, tsId: team.ts_id });

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

    return this.teamRepo.update(teamId, { status: TEAM_STATUS.REJECTED });
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

    const updated = this.teamRepo.update(teamId, { status: TEAM_STATUS.WITHDRAWN });

    // If matches already exist, mark future matches as cancelled/walkover
    const matchRepo = new BaseRepository('Match', 'match_id');
    const matches = matchRepo.where('ts_id', team.ts_id);
    matches.forEach(m => {
      if (m.status === MATCH_STATUS.SCHEDULED) {
        if (m.team1_id === teamId) {
          matchRepo.update(m.match_id, { status: MATCH_STATUS.CANCELLED, winner_team_id: m.team2_id, notes: 'Đội 1 rút lui' });
        } else if (m.team2_id === teamId) {
          matchRepo.update(m.match_id, { status: MATCH_STATUS.CANCELLED, winner_team_id: m.team1_id, notes: 'Đội 2 rút lui' });
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

  /**
   * Validate raw import rows for a TournamentSport before creation
   */
  validateImportData(tsId, rows) {
    if (!Array.isArray(rows) || rows.length === 0) {
      return { valid: false, errors: ['File dữ liệu không có dòng nào.'], parsedTeams: [] };
    }

    const ts = this.tsRepo.getById(tsId);
    if (!ts) return { valid: false, errors: ['Môn thi đấu không tồn tại.'] };

    const sport = this.sportRepo.getById(ts.sport_id);

    // Group rows by team name
    const teamMap = {};
    rows.forEach((row, idx) => {
      const teamName = (row.team_name || row['Tên Đội'] || row['Tên Cặp'] || `Đội ${idx + 1}`).trim();
      if (!teamMap[teamName]) {
        teamMap[teamName] = {
          name: teamName,
          captain_email: row.captain_email || row['Email Đội Trưởng'] || row['Email VĐV 1'] || '',
          players: []
        };
      }
      
      // Doubles import row support (VĐV 1 + VĐV 2 in 1 row)
      if (row['Tên VĐV 1'] || row['Tên VĐV 2']) {
        if (row['Tên VĐV 1']) {
          teamMap[teamName].players.push({
            name: row['Tên VĐV 1'],
            email: row['Email VĐV 1'] || '',
            gender: row['Giới tính 1'] === 'Nam' ? 'male' : (row['Giới tính 1'] === 'Nữ' ? 'female' : (row['Giới tính 1'] || '')),
            phone: row['SĐT 1'] || '',
            jersey_number: row['Số Áo 1'] || 1,
            position: row['Vị Trí 1'] || ''
          });
        }
        if (row['Tên VĐV 2']) {
          teamMap[teamName].players.push({
            name: row['Tên VĐV 2'],
            email: row['Email VĐV 2'] || '',
            gender: row['Giới tính 2'] === 'Nam' ? 'male' : (row['Giới tính 2'] === 'Nữ' ? 'female' : (row['Giới tính 2'] || '')),
            phone: row['SĐT 2'] || '',
            jersey_number: row['Số Áo 2'] || 2,
            position: row['Vị Trí 2'] || ''
          });
        }
      } else {
        // Standard team import row (1 player per row)
        teamMap[teamName].players.push({
          name: row.player_name || row['Tên VĐV'] || row.name || '',
          email: row.player_email || row['Email VĐV'] || row.email || '',
          gender: (row.gender === 'Nam' || row['Giới tính'] === 'Nam') ? 'male' : ((row.gender === 'Nữ' || row['Giới tính'] === 'Nữ') ? 'female' : (row.gender || row['Giới tính'] || '')),
          phone: row.phone || row['SĐT'] || '',
          jersey_number: row.jersey_number || row['Số Áo'] || '',
          position: row.position || row['Vị Trí'] || ''
        });
      }
    });

    const parsedTeams = Object.values(teamMap);
    const errors = [];

    parsedTeams.forEach(t => {
      if (sport) {
        // 1. Min/max players
        if (t.players.length < Number(sport.min_players_per_team)) {
          errors.push(`Đội "${t.name}" chỉ có ${t.players.length} VĐV (Yêu cầu tối thiểu ${sport.min_players_per_team}).`);
        }
        if (t.players.length > Number(sport.max_players_per_team)) {
          errors.push(`Đội "${t.name}" có ${t.players.length} VĐV (Yêu cầu tối đa ${sport.max_players_per_team}).`);
        }

        // 2. Category gender validation
        const category = ts.category || '';
        if (category.startsWith('mens_') || category === 'mens') {
          const invalid = t.players.find(p => p.gender && p.gender !== 'male');
          if (invalid) errors.push(`Đội "${t.name}": Hạng mục Đôi Nam / Đơn Nam chỉ dành cho VĐV Nam.`);
        } else if (category.startsWith('womens_') || category === 'womens') {
          const invalid = t.players.find(p => p.gender && p.gender !== 'female');
          if (invalid) errors.push(`Đội "${t.name}": Hạng mục Đôi Nữ / Đơn Nữ chỉ dành cho VĐV Nữ.`);
        } else if (category === 'mixed_doubles' || category === 'mixed') {
          if (t.players.length === 2) {
            const males = t.players.filter(p => p.gender === 'male').length;
            const females = t.players.filter(p => p.gender === 'female').length;
            if (males !== 1 || females !== 1) {
              errors.push(`Đội "${t.name}": Hạng mục Đôi Nam Nữ phải gồm đúng 1 Nam và 1 Nữ.`);
            }
          }
        }

        // 3. Position rules validation (e.g. Football goalkeeper requirement)
        if (sport.position_rules) {
          try {
            const rules = typeof sport.position_rules === 'string' ? JSON.parse(sport.position_rules) : sport.position_rules;
            if (rules && rules.goalkeeper && rules.goalkeeper.min) {
              const gkCount = t.players.filter(p => p.position === 'goalkeeper').length;
              if (gkCount < rules.goalkeeper.min) {
                errors.push(`Đội "${t.name}" thi đấu môn ${sport.name} bắt buộc phải có ít nhất ${rules.goalkeeper.min} Thủ môn (Goalkeeper).`);
              }
            }
          } catch (e) {}
        }

        // 4. Unique Jersey Number validation
        const jerseys = t.players.map(p => String(p.jersey_number || '').trim()).filter(j => j !== '');
        const uniqueJerseys = new Set(jerseys);
        if (uniqueJerseys.size < jerseys.length) {
          errors.push(`Đội "${t.name}": Số áo của các thành viên trong đội không được trùng nhau.`);
        }
      }
    });

    return {
      valid: errors.length === 0,
      errors: errors,
      parsedTeams: parsedTeams
    };
  }

  /**
   * Bulk Import Teams into TournamentSport
   */
  importTeamsFromCsv(tsId, rows) {
    const ts = this.tsRepo.getById(tsId);
    if (!ts) throw new Error('Không tìm thấy thông tin môn thi đấu.');

    getAuthService().checkPermission(ts.tournament_id, ['organizer', 'editor']);

    const validation = this.validateImportData(tsId, rows);
    if (!validation.valid && validation.errors.length > 0) {
      throw new Error('Dữ liệu import không hợp lệ:\n' + validation.errors.join('\n'));
    }

    const createdTeams = [];
    validation.parsedTeams.forEach(tData => {
      const registered = this.registerTeam({
        ts_id: tsId,
        name: tData.name,
        captain_email: tData.captain_email || (tData.players[0] ? tData.players[0].email : ''),
        players: tData.players
      });
      // Auto approve imported teams
      this.approveTeam(registered.team_id);
      createdTeams.push(registered);
    });

    return {
      success: true,
      message: `Đã import thành công ${createdTeams.length} đội thi đấu.`,
      teams: createdTeams
    };
  }

  /**
   * Webhook Handler for Auto-Billing / Payment Gateways (Casso / Sepay)
   */
  handlePaymentWebhook(payload) {
    if (!payload || !payload.content) {
      return { success: false, message: 'Invalid payload' };
    }

    // Look for Team ID or Registration reference in transfer description
    const content = String(payload.content || payload.description || '');
    const teamIdMatch = content.match(/TM[a-zA-Z0-9_-]+/i);
    
    if (teamIdMatch) {
      const teamId = teamIdMatch[0];
      const team = this.teamRepo.getById(teamId);
      if (team && team.status === TEAM_STATUS.PENDING) {
        this.approveTeam(team.team_id, true);
        return { success: true, message: `Auto approved team ${team.team_id} via payment webhook.` };
      }
    }

    return { success: true, message: 'Webhook processed without matching pending team.' };
  }
  /**
   * Get all teams associated with current user (as captain or member)
   */
  getMyRegisteredTeams() {
    const auth = getAuthService();
    const userEmail = auth.getCurrentUserEmail();
    if (!userEmail) return [];

    const cleanEmail = userEmail.toLowerCase().trim();
    const allTeams = this.teamRepo.getAll();
    const allPlayers = this.playerRepo.getAll();
    const allTS = this.tsRepo.getAll();
    const allTournaments = this.tournamentRepo.getAll();

    const myTeams = allTeams.filter(t => {
      if (String(t.captain_email).toLowerCase().trim() === cleanEmail) return true;
      return allPlayers.some(p => p.team_id === t.team_id && String(p.email).toLowerCase().trim() === cleanEmail);
    });

    return myTeams.map(t => {
      const ts = allTS.find(s => s.ts_id === t.ts_id);
      const tournament = ts ? allTournaments.find(tour => tour.tournament_id === ts.tournament_id) : null;
      return Object.assign({}, t, {
        tournament_name: tournament ? tournament.name : '',
        tournament_id: tournament ? tournament.tournament_id : '',
        tournament_status: tournament ? tournament.status : ''
      });
    });
  }
}

// Singleton Instance Helper
let _teamServiceInstance = null;
function getTeamService() {
  if (!_teamServiceInstance) {
    _teamServiceInstance = new RegistrationService();
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

function apiGetMyRegisteredTeams() {
  return getTeamService().getMyRegisteredTeams();
}

function apiGetTeamsByTournamentSport(tsId) {
  return getTeamService().getTeamsByTournamentSport(tsId);
}

function apiGetTeamById(teamId) {
  return getTeamService().getTeamById(teamId);
}

function apiValidateImportData(tsId, rows) {
  return getTeamService().validateImportData(tsId, rows);
}

function apiImportTeamsFromCsv(tsId, rows) {
  return getTeamService().importTeamsFromCsv(tsId, rows);
}
