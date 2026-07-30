/**
 * TeamService.gs - Team Registration, Roster Management & Approval Workflow
 */

class TeamService {
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
      t.status !== 'withdrawn' && t.status !== 'rejected'
    );
    if (duplicate) {
      throw new Error(`Tên đội "${data.name}" đã tồn tại trong môn thi đấu này.`);
    }

    // Check maximum teams limit
    const approvedOrPending = existingTeams.filter(t => ['approved', 'pending'].includes(t.status));
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

    const captainEmail = data.captain_email || userEmail;
    const teamId = generateId('TM');
    const roleInTournament = auth.getUserRole(ts.tournament_id, userEmail);

    // Auto approve if registered by organizer
    const initialStatus = (roleInTournament === 'organizer') ? 'approved' : 'pending';

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
        role_in_team: idx === 0 ? 'captain' : (p.role_in_team || 'player')
      });
    });

    // Auto assign roles if approved
    if (initialStatus === 'approved') {
      auth.assignRole(ts.tournament_id, captainEmail, 'player', userEmail);
    }

    // Send confirmation email
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
  approveTeam(teamId, clientEmail) {
    const team = this.teamRepo.getById(teamId);
    if (!team) throw new Error('Không tìm thấy thông tin đội.');

    const ts = this.tsRepo.getById(team.ts_id);
    const auth = getAuthService();
    auth.checkPermission(ts.tournament_id, ['organizer'], clientEmail);

    const updated = this.teamRepo.update(teamId, { status: 'approved' });

    const players = this.playerRepo.where('team_id', teamId);
    const userEmail = auth.getCurrentUserEmail() || clientEmail || team.captain_email;
    
    auth.assignRole(ts.tournament_id, team.captain_email, 'player', userEmail);
    players.forEach(p => {
      if (p.email) {
        auth.assignRole(ts.tournament_id, p.email, 'player', userEmail);
      }
    });

    return updated;
  }

  /**
   * Reject team registration (Organizer only)
   */
  rejectTeam(teamId, clientEmail) {
    const team = this.teamRepo.getById(teamId);
    if (!team) throw new Error('Không tìm thấy thông tin đội.');

    const ts = this.tsRepo.getById(team.ts_id);
    getAuthService().checkPermission(ts.tournament_id, ['organizer'], clientEmail);

    return this.teamRepo.update(teamId, { status: 'rejected' });
  }

  /**
   * Withdraw team registration
   */
  withdrawTeam(teamId, clientEmail) {
    const team = this.teamRepo.getById(teamId);
    if (!team) throw new Error('Không tìm thấy thông tin đội.');

    const ts = this.tsRepo.getById(team.ts_id);
    const auth = getAuthService();
    let currentUser = auth.getCurrentUserEmail() || clientEmail;
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

// Lazy Singleton Helper
function getTeamService() {
  if (!this._teamServiceInstance) {
    this._teamServiceInstance = new TeamService();
  }
  return this._teamServiceInstance;
}

/**
 * Server Exposed APIs for Client
 */
function apiRegisterTeam(data) {
  return getTeamService().registerTeam(data);
}

function apiApproveTeam(teamId, clientEmail) {
  return getTeamService().approveTeam(teamId, clientEmail);
}

function apiRejectTeam(teamId, clientEmail) {
  return getTeamService().rejectTeam(teamId, clientEmail);
}

function apiWithdrawTeam(teamId, clientEmail) {
  return getTeamService().withdrawTeam(teamId, clientEmail);
}

function apiGetTeamsByTournamentSport(tsId) {
  return getTeamService().getTeamsByTournamentSport(tsId);
}

function apiGetTeamById(teamId) {
  return getTeamService().getTeamById(teamId);
}
