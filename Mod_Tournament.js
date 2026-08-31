/**
 * Mod_Tournament.js - Module 1: Tournament Config & Lifecycle Management
 */

class TournamentConfigService {
  get tournamentRepo() { return new BaseRepository('Tournament', 'tournament_id'); }
  get tsRepo() { return new BaseRepository('TournamentSport', 'ts_id'); }
  get sportRepo() { return new BaseRepository('Sport', 'sport_id'); }
  get teamRepo() { return new BaseRepository('Team', 'team_id'); }
  get roleRepo() { return new BaseRepository('TournamentRole', 'role_id'); }

  /**
   * Create new Tournament
   */
  createTournament(data) {
    const auth = getAuthService();
    let userEmail = auth.getCurrentUserEmail();
    
    if (!userEmail && data.organizer_email) {
      userEmail = String(data.organizer_email).toLowerCase().trim();
    }

    if (!userEmail) {
      throw new Error('Bạn cần nhập/đăng nhập bằng tài khoản Google để tạo giải đấu.');
    }

    if (!data.name || !data.start_date || !data.end_date || !data.location) {
      throw new Error('Vui lòng điền đầy đủ các thông tin bắt buộc của giải đấu.');
    }

    const tournamentId = generateId('T');
    const now = new Date().toISOString();

    const tournament = {
      tournament_id: tournamentId,
      name: data.name,
      description: data.description || '',
      start_date: data.start_date,
      end_date: data.end_date,
      location: data.location,
      organizer_email: userEmail,
      status: TOURNAMENT_STATUS.DRAFT,
      created_at: now,
      updated_at: now
    };

    this.tournamentRepo.insert(tournament);
    auth.assignRole(tournamentId, userEmail, 'organizer', userEmail);

    if (Array.isArray(data.sports) && data.sports.length > 0) {
      data.sports.forEach(sportConfig => {
        this.addSportToTournament(tournamentId, sportConfig, userEmail);
      });
    }

    return tournament;
  }

  /**
   * Update Tournament details
   */
  updateTournament(tournamentId, data) {
    getAuthService().checkPermission(tournamentId, ['organizer']);

    const existing = this.tournamentRepo.getById(tournamentId);
    if (!existing) throw new Error('Không tìm thấy giải đấu.');

    const updatedData = {
      name: data.name || existing.name,
      description: data.description !== undefined ? data.description : existing.description,
      start_date: data.start_date || existing.start_date,
      end_date: data.end_date || existing.end_date,
      location: data.location || existing.location,
      updated_at: new Date().toISOString()
    };

    return this.tournamentRepo.update(tournamentId, updatedData);
  }

  /**
   * Delete Tournament (Only allowed in 'draft' status)
   */
  deleteTournament(tournamentId) {
    getAuthService().checkPermission(tournamentId, ['organizer']);

    const existing = this.tournamentRepo.getById(tournamentId);
    if (!existing) throw new Error('Không tìm thấy giải đấu.');

    if (existing.status !== TOURNAMENT_STATUS.DRAFT) {
      throw new Error('Chỉ có thể xóa giải đấu ở trạng thái Nháp (draft).');
    }

    const tsList = this.tsRepo.where('tournament_id', tournamentId);
    tsList.forEach(ts => {
      this.teamRepo.deleteWhere('ts_id', ts.ts_id);
      new BaseRepository('Match', 'match_id').deleteWhere('ts_id', ts.ts_id);
      new BaseRepository('Ranking', 'ranking_id').deleteWhere('ts_id', ts.ts_id);
    });
    this.tsRepo.deleteWhere('tournament_id', tournamentId);
    this.roleRepo.deleteWhere('tournament_id', tournamentId);

    return this.tournamentRepo.delete(tournamentId);
  }

  getTournamentList(filters = {}) {
    let tournaments = this.tournamentRepo.getAll();

    if (filters.status && filters.status !== 'all') {
      tournaments = tournaments.filter(t => t.status === filters.status);
    }

    if (filters.search) {
      const q = filters.search.toLowerCase();
      tournaments = tournaments.filter(t => 
        t.name.toLowerCase().includes(q) || 
        t.location.toLowerCase().includes(q)
      );
    }

    const allTS = this.tsRepo.getAll();
    const allTeams = this.teamRepo.getAll();

    return tournaments.map(t => {
      const sportsInTournament = allTS.filter(ts => ts.tournament_id === t.tournament_id);
      const tsIds = sportsInTournament.map(ts => ts.ts_id);
      const teamsInTournament = allTeams.filter(team => tsIds.includes(team.ts_id) && team.status === TEAM_STATUS.APPROVED);

      return Object.assign({}, t, {
        sports_count: sportsInTournament.length,
        approved_teams_count: teamsInTournament.length
      });
    }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  getTournamentById(tournamentId) {
    const tournament = this.tournamentRepo.getById(tournamentId);
    if (!tournament) return null;

    const tsList = this.tsRepo.where('tournament_id', tournamentId);
    const sportsList = this.sportRepo.getAll();

    const sportsWithDetails = tsList.map(ts => {
      const sportInfo = sportsList.find(s => s.sport_id === ts.sport_id);
      const teams = this.teamRepo.where('ts_id', ts.ts_id);
      return Object.assign({}, ts, {
        sport_name: sportInfo ? sportInfo.name : '',
        sport_type: sportInfo ? sportInfo.type : '',
        scoring_type: sportInfo ? sportInfo.scoring_type : '',
        min_players_per_team: sportInfo ? sportInfo.min_players_per_team : 1,
        max_players_per_team: sportInfo ? sportInfo.max_players_per_team : 1,
        positions: sportInfo ? sportInfo.positions : '',
        position_rules: sportInfo ? sportInfo.position_rules : '',
        category: ts.category || '',
        skill_level: ts.skill_level || '',
        registered_teams_count: teams.filter(tm => tm.status === TEAM_STATUS.APPROVED).length
      });
    });

    return Object.assign({}, tournament, {
      sports: sportsWithDetails
    });
  }

  /**
   * [MODIFY]: Nâng cấp logic addSportToTournament theo Option 2
   */
  addSportToTournament(tournamentId, config) {
    getAuthService().checkPermission(tournamentId, ['organizer', 'editor']);

    const tournament = this.tournamentRepo.getById(tournamentId);
    if (!tournament) throw new Error('Không tìm thấy giải đấu.');

    // 1. Validate Hạn chót đăng ký
    if (config.registration_deadline && tournament.start_date) {
      if (new Date(config.registration_deadline) > new Date(tournament.start_date)) {
        throw new Error('Hạn chót đăng ký không thể sau ngày bắt đầu giải đấu.');
      }
    }

    // 2. Điểm hòa mặc định theo môn
    let ptsDraw = !isNaN(Number(config.points_for_draw)) ? Number(config.points_for_draw) : 1;
    if (['S002', 'S003', 'S004', 'S005'].includes(config.sport_id)) {
      ptsDraw = 0; // Cầu lông, Bóng bàn, Pickleball, Bóng chuyền ép điểm hòa = 0
    }

    // 3. Cấu hình mốc điểm mỗi set
    let ptsTarget = Number(config.points_target_per_set);
    if (!ptsTarget) {
      if (config.sport_id === 'S004' || config.sport_id === 'S005') ptsTarget = 11; // Bóng bàn, Pickleball
      else if (config.sport_id === 'S003') ptsTarget = 21; // Cầu lông
      else if (config.sport_id === 'S002') ptsTarget = 25; // Bóng chuyền
      else ptsTarget = 0; // Bóng đá thì không dùng set
    }

    const tsId = generateId('TS');
    const newTS = {
      ts_id: tsId,
      tournament_id: tournamentId,
      sport_id: config.sport_id,
      format: config.format || 'round_robin',
      max_teams: Number(config.max_teams) || 8,
      min_teams: Number(config.min_teams) || 2,
      points_for_win: !isNaN(Number(config.points_for_win)) ? Number(config.points_for_win) : 3,
      points_for_draw: ptsDraw,
      points_for_loss: !isNaN(Number(config.points_for_loss)) ? Number(config.points_for_loss) : 0,
      num_groups: Number(config.num_groups) || 1,
      teams_advance_per_group: Number(config.teams_advance_per_group) || 2,
      registration_deadline: config.registration_deadline || '',
      status: TOURNAMENT_STATUS.OPEN,
      category: config.category || '',
      skill_level: config.skill_level || '',
      points_target_per_set: ptsTarget
    };

    return this.tsRepo.insert(newTS);
  }

  updateStatus(tournamentId, newStatus) {
    getAuthService().checkPermission(tournamentId, ['organizer']);

    const validStatuses = [
      TOURNAMENT_STATUS.DRAFT,
      TOURNAMENT_STATUS.OPEN,
      TOURNAMENT_STATUS.IN_PROGRESS,
      TOURNAMENT_STATUS.COMPLETED,
      TOURNAMENT_STATUS.CANCELLED,
      TOURNAMENT_STATUS.ARCHIVED
    ];
    if (!validStatuses.includes(newStatus)) {
      throw new Error('Trạng thái giải đấu không hợp lệ: ' + newStatus);
    }

    const updated = this.tournamentRepo.update(tournamentId, {
      status: newStatus,
      updated_at: new Date().toISOString()
    });

    const tsList = this.tsRepo.where('tournament_id', tournamentId);
    tsList.forEach(ts => {
      let tsStatus = ts.status;
      if (newStatus === TOURNAMENT_STATUS.OPEN) tsStatus = 'open';
      else if (newStatus === TOURNAMENT_STATUS.IN_PROGRESS) tsStatus = 'in_progress';
      else if (newStatus === TOURNAMENT_STATUS.COMPLETED || newStatus === TOURNAMENT_STATUS.ARCHIVED) tsStatus = 'completed';
      this.tsRepo.update(ts.ts_id, { status: tsStatus });
    });

    return updated;
  }
}

function setupDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  Object.keys(SCHEMAS).forEach(sheetName => {
    let sheet = ss.getSheetByName(sheetName);
    const headers = SCHEMAS[sheetName];
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.appendRow(headers);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#e5e7eb");
    } else {
      const lastCol = sheet.getLastColumn();
      if (lastCol === 0) {
        sheet.appendRow(headers);
      } else {
        sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      }
      sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#e5e7eb");
    }
  });

  const sportRepo = new BaseRepository('Sport', 'sport_id');
  const existingSports = sportRepo.getAll();

  SEED_SPORTS.forEach(s => {
    const existing = existingSports.find(es => es.sport_id === s.sport_id);
    if (!existing) {
      sportRepo.insert(s);
    } else {
      sportRepo.update(s.sport_id, {
        categories: s.categories,
        positions: s.positions,
        position_rules: s.position_rules,
        has_skill_level: s.has_skill_level,
        default_levels: s.default_levels
      });
    }
  });

  if (typeof Logger !== 'undefined' && Logger.log) {
    Logger.log('Database setup and migration completed successfully.');
  }
  return { success: true, message: 'Database setup completed successfully.' };
}

let _tournamentServiceInstance = null;
function getTournamentService() {
  if (!_tournamentServiceInstance) {
    _tournamentServiceInstance = new TournamentConfigService();
  }
  return _tournamentServiceInstance;
}

function apiCreateTournament(data) { return getTournamentService().createTournament(data); }
function apiUpdateTournament(tournamentId, data) { return getTournamentService().updateTournament(tournamentId, data); }
function apiDeleteTournament(tournamentId) { return getTournamentService().deleteTournament(tournamentId); }
function apiGetTournamentList(filters) { return getTournamentService().getTournamentList(filters); }
function apiGetTournamentById(tournamentId) { return getTournamentService().getTournamentById(tournamentId); }
function apiAddSportToTournament(tournamentId, config) { return getTournamentService().addSportToTournament(tournamentId, config); }
function apiUpdateTournamentStatus(tournamentId, newStatus) { return getTournamentService().updateStatus(tournamentId, newStatus); }
function apiGetAllSports() { return new BaseRepository('Sport', 'sport_id').getAll(); }