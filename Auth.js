const PERMISSION_MAP = {
  'create_tournament':    ['organizer'],
  'edit_tournament':      ['organizer', 'editor'],
  'delete_tournament':    ['organizer'],
  'change_status':        ['organizer'],
  'add_sport':            ['organizer', 'editor'],
  'register_team':        ['organizer', 'player'],
  'approve_registration': ['organizer'],
  'import_teams':         ['organizer'],
  'generate_schedule':    ['organizer'],
  'edit_schedule':        ['organizer', 'editor'],
  'update_result':        ['organizer', 'referee'],
  'assign_role':          ['organizer'],
  'view_data':            ['organizer', 'editor', 'referee', 'player', 'viewer']
};

class AuthService {
  get userRepo() { return new BaseRepository('User', 'user_id'); }
  get roleRepo() { return new BaseRepository('TournamentRole', 'role_id'); }
  get tournamentRepo() { return new BaseRepository('Tournament', 'tournament_id'); }
  get teamRepo() { return new BaseRepository('Team', 'team_id'); }
  get playerRepo() { return new BaseRepository('Player', 'player_id'); }
  get auditLogRepo() { return new BaseRepository('AuditLog', 'log_id'); }

  /**
   * Get active user email from session
   */
  getCurrentUserEmail() {
    try {
      const email = Session.getActiveUser().getEmail();
      return email ? email.toLowerCase().trim() : '';
    } catch (e) {
      return '';
    }
  }

  /**
   * Lấy email của người deploy/chủ sở hữu script hoặc cấu hình trong ScriptProperties
   */
  getSystemSuperAdminEmail() {
    try {
      if (typeof PropertiesService !== 'undefined' && PropertiesService.getScriptProperties) {
        const propEmail = PropertiesService.getScriptProperties().getProperty('SUPER_ADMIN_EMAIL');
        if (propEmail) return propEmail.toLowerCase().trim();
      }
      // 2. Kiểm tra trong User repo xem có user nào system_role === 'super_admin'
      const adminUser = this.userRepo.findOne(u => u.system_role === 'super_admin');
      if (adminUser && adminUser.email) {
        return String(adminUser.email).toLowerCase().trim();
      }

      // 3. Fallback sang Session.getEffectiveUser (tài khoản người deploy web app)
      if (typeof Session !== 'undefined' && Session.getEffectiveUser) {
        const effective = Session.getEffectiveUser();
        if (effective && effective.getEmail()) {
          return effective.getEmail().toLowerCase().trim();
        }
      }
    } catch (e) {
      // fallback
    }
    return '';
  }

  /**
   * Xác thực mã khóa bảo mật Quản trị viên (Admin Passcode)
   */
  verifyAdminPasscode(passcode) {
    if (!passcode) return false;
    let validKey = 'admin123';
    try {
      if (typeof PropertiesService !== 'undefined' && PropertiesService.getScriptProperties) {
        const propKey = PropertiesService.getScriptProperties().getProperty('ADMIN_SECRET_KEY');
        if (propKey) validKey = propKey;
      }
    } catch (e) {}
    return String(passcode).trim() === validKey.trim();
  }

  /**
   * Kiểm tra người dùng có quyền Quản trị toàn hệ thống (Super Admin) hay không
   */
  isSystemAdmin(userEmail) {
    const email = (userEmail || this.getCurrentUserEmail()).toLowerCase().trim();
    if (!email) return false;

    // 1. Kiểm tra email Super Admin được cấu hình tường minh
    const superAdmin = this.getSystemSuperAdminEmail();
    if (superAdmin && email === superAdmin) return true;

    // 2. Kiểm tra cột system_role trong bảng User
    const user = this.userRepo.findOne(u => String(u.email).toLowerCase().trim() === email);
    if (user && user.system_role === 'super_admin') return true;

    return false;
  }

  /**
   * Bảo vệ API System Admin, ném lỗi nếu không có quyền
   */
  checkSystemAdminAccess(passcode) {
    const email = this.getCurrentUserEmail();
    const isPasscodeValid = passcode ? this.verifyAdminPasscode(passcode) : false;
    if (!this.isSystemAdmin(email) && !isPasscodeValid) {
      this.logAudit('ADMIN_ACCESS_DENIED', 'System', 'ALL', `Email ${email || 'anonymous'} attempted unauthorized admin access`);
      throw new Error('Từ chối truy cập: Bạn không có quyền Quản Trị Hệ Thống (Super Admin). Vui lòng xác thực mã bảo mật.');
    }
    return email || 'admin_passcode_user';
  }

  /**
   * Ghi log thao tác hệ thống vào bảng AuditLog
   */
  logAudit(action, entityType, entityId, details, userEmail) {
    try {
      const email = userEmail || this.getCurrentUserEmail() || 'system';
      this.auditLogRepo.insert({
        log_id: generateId('LOG'),
        timestamp: new Date().toISOString(),
        user_email: email,
        action: action,
        entity_type: entityType,
        entity_id: entityId || '',
        details: typeof details === 'object' ? JSON.stringify(details) : String(details || '')
      });
    } catch (err) {
      Logger.log('Error logging audit: ' + err.message);
    }
  }

  /**
   * Đăng ký hoặc cập nhật hồ sơ người dùng
   */
  registerUser(email, displayName, pictureUrl) {
    if (!email) return null;
    const cleanEmail = email.toLowerCase().trim();
    let user = this.userRepo.findOne(u => String(u.email).toLowerCase() === cleanEmail);

    const now = new Date().toISOString();
    if (!user) {
      user = {
        user_id: generateId('U'),
        email: cleanEmail,
        display_name: displayName || cleanEmail.split('@')[0],
        created_at: now
      };
      this.userRepo.insert(user);
    } else if (displayName && user.display_name !== displayName) {
      user = this.userRepo.update(user.user_id, { display_name: displayName });
    }
    return user;
  }

  /**
   * Xác định vai trò duy nhất theo Giải đấu (Tournament-Scoped RBAC)
   */
  getUserRole(tournamentId, userEmail) {
    const email = (userEmail || this.getCurrentUserEmail()).toLowerCase().trim();
    if (!email || !tournamentId) return 'viewer';

    // 1. Kiểm tra nếu là Người tạo giải đấu
    const tournament = this.tournamentRepo.getById(tournamentId);
    if (tournament && String(tournament.organizer_email).toLowerCase().trim() === email) {
      return 'organizer';
    }

    // 2. Kiểm tra vai trò được gán tường minh trong sheet TournamentRole (VD: editor, referee)
    const roleRecord = this.roleRepo.findOne(r => 
      String(r.tournament_id) === String(tournamentId) && 
      String(r.user_email).toLowerCase().trim() === email
    );
    if (roleRecord) {
      return roleRecord.role;
    }

    // 3. Kiểm tra vai trò VĐV / Đội trưởng trong các đội đã duyệt của giải
    const tsRepo = new BaseRepository('TournamentSport', 'ts_id');
    const tournamentSports = tsRepo.where('tournament_id', tournamentId);
    const tsIds = tournamentSports.map(ts => ts.ts_id);

    const allTeams = this.teamRepo.getAll();
    const userTeams = allTeams.filter(t => tsIds.includes(t.ts_id));
    const teamIds = userTeams.map(t => t.team_id);

    if (teamIds.length > 0) {
      const isCaptain = userTeams.some(t => String(t.captain_email).toLowerCase().trim() === email);
      if (isCaptain) return 'player';

      const playerMatch = this.playerRepo.findOne(p => 
        teamIds.includes(p.team_id) && String(p.email).toLowerCase().trim() === email
      );
      if (playerMatch) return 'player';
    }

    return 'viewer';
  }

  /**
   * Gán vai trò cho người dùng trong giải đấu (Chỉ Organizer của giải đó mới có quyền)
   */
  assignRole(tournamentId, targetEmail, role, assignedBy) {
    if (!['organizer', 'editor', 'referee', 'player'].includes(role)) {
      throw new Error('Vai trò không hợp lệ: ' + role);
    }
    const cleanEmail = targetEmail.toLowerCase().trim();

    const existing = this.roleRepo.findOne(r => 
      String(r.tournament_id) === String(tournamentId) && 
      String(r.user_email).toLowerCase().trim() === cleanEmail
    );

    if (existing) {
      return this.roleRepo.update(existing.role_id, {
        role: role,
        assigned_at: new Date().toISOString(),
        assigned_by: assignedBy
      });
    } else {
      const newRole = {
        role_id: generateId('TR'),
        tournament_id: tournamentId,
        user_email: cleanEmail,
        role: role,
        assigned_at: new Date().toISOString(),
        assigned_by: assignedBy
      };
      return this.roleRepo.insert(newRole);
    }
  }

  /**
   * Thu hồi vai trò người dùng trong giải đấu
   */
  revokeRole(tournamentId, targetEmail, role, revokedBy) {
    const cleanEmail = targetEmail.toLowerCase().trim();
    
    const remaining = this.roleRepo.where('tournament_id', tournamentId);
    const toDelete = remaining.find(r => 
      String(r.user_email).toLowerCase().trim() === cleanEmail && 
      (!role || r.role === role)
    );

    if (toDelete) {
      this.roleRepo.delete(toDelete.role_id);
    }

    Logger.log(`Revoked role ${role} for ${targetEmail} in tournament ${tournamentId} by ${revokedBy}`);
    return { success: true, message: `Đã thu hồi quyền ${role} của ${targetEmail}` };
  }

  /**
   * Lấy danh sách vai trò đã gán cho một Giải đấu
   */
  getAssignedRoles(tournamentId) {
    return this.roleRepo.where('tournament_id', tournamentId);
  }

  /**
   * Kiểm tra quyền thực thi API ở cấp giải đấu theo danh sách role
   */
  /**
   * Kiểm tra quyền thực thi API ở cấp giải đấu theo danh sách role (Super Admin bypass)
   */
  checkPermission(tournamentId, allowedRoles) {
    const email = this.getCurrentUserEmail();
    if (this.isSystemAdmin(email)) {
      return { email, role: 'super_admin' };
    }
    const role = this.getUserRole(tournamentId, email);

    if (!allowedRoles.includes(role)) {
      throw new Error(`Bạn không có quyền thực hiện thao tác này ở giải đấu. Quyền hiện tại: ${role}. Quyền yêu cầu: ${allowedRoles.join(', ')}`);
    }
    return { email, role };
  }

  /**
   * Kiểm tra quyền thực thi action cụ thể theo PERMISSION_MAP (Super Admin bypass)
   */
  checkAction(tournamentId, actionName) {
    const email = this.getCurrentUserEmail();
    if (this.isSystemAdmin(email)) {
      return { email, role: 'super_admin' };
    }
    const role = this.getUserRole(tournamentId, email);
    const allowedRoles = PERMISSION_MAP[actionName] || ['organizer'];

    if (!allowedRoles.includes(role)) {
      throw new Error(`Bạn không có quyền thực hiện hành động "${actionName}" ở giải đấu. Vai trò hiện tại: ${role}. Quyền yêu cầu: ${allowedRoles.join(', ')}`);
    }
    return { email, role };
  }
}

// Singleton Helper (global variable for V8 reliability)
let _authServiceInstance = null;
function getAuthService() {
  if (!_authServiceInstance) {
    _authServiceInstance = new AuthService();
  }
  return _authServiceInstance;
}

/**
 * Global Audit Logging Function
 */
function logAudit(action, entityType, entityId, details, userEmail) {
  return getAuthService().logAudit(action, entityType, entityId, details, userEmail);
}

/**
 * Server Exposed APIs for Client
 */
function apiGetAuthContext(tournamentId) {
  const auth = getAuthService();
  const email = auth.getCurrentUserEmail();
  const role = auth.getUserRole(tournamentId, email);
  const isSysAdmin = auth.isSystemAdmin(email);
  
  if (email) {
    auth.registerUser(email);
  }

  return {
    email: email,
    role: role,
    isLoggedIn: !!email,
    isSystemAdmin: isSysAdmin
  };
}

function apiAssignRole(tournamentId, targetEmail, role) {
  const auth = getAuthService();
  auth.checkPermission(tournamentId, ['organizer']);
  const currentEmail = auth.getCurrentUserEmail();
  const result = auth.assignRole(tournamentId, targetEmail, role, currentEmail);
  auth.logAudit('ASSIGN_ROLE', 'TournamentRole', tournamentId, `Assigned role ${role} to ${targetEmail}`, currentEmail);
  return result;
}

function apiRevokeRole(tournamentId, targetEmail, role) {
  const auth = getAuthService();
  auth.checkPermission(tournamentId, ['organizer']);
  const currentEmail = auth.getCurrentUserEmail();
  const result = auth.revokeRole(tournamentId, targetEmail, role, currentEmail);
  auth.logAudit('REVOKE_ROLE', 'TournamentRole', tournamentId, `Revoked role ${role} from ${targetEmail}`, currentEmail);
  return result;
}

function apiGetAssignedRoles(tournamentId) {
  return getAuthService().getAssignedRoles(tournamentId);
}

function apiCheckAction(tournamentId, actionName) {
  return getAuthService().checkAction(tournamentId, actionName);
}

function apiIsSystemAdmin() {
  const auth = getAuthService();
  const email = auth.getCurrentUserEmail();
  return {
    email: email,
    isAdmin: auth.isSystemAdmin(email)
  };
}

function apiVerifyAdminPasscode(passcode) {
  const auth = getAuthService();
  const isValid = auth.verifyAdminPasscode(passcode);
  if (isValid) {
    return { success: true };
  }
  throw new Error('Mã bảo mật Quản trị viên không chính xác. Vui lòng thử lại.');
}

function apiGetAdminDashboardData(passcode) {
  const auth = getAuthService();
  const adminEmail = auth.checkSystemAdminAccess(passcode);

  const tourRepo = new BaseRepository('Tournament', 'tournament_id');
  const userRepo = new BaseRepository('User', 'user_id');
  const sportRepo = new BaseRepository('Sport', 'sport_id');
  const auditRepo = new BaseRepository('AuditLog', 'log_id');
  const teamRepo = new BaseRepository('Team', 'team_id');

  const allTournaments = tourRepo.getAll();
  const allUsers = userRepo.getAll();
  const allSports = sportRepo.getAll();
  const allTeams = teamRepo.getAll();
  const allAudits = auditRepo.getAll().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 100);

  const kpis = {
    total_tournaments: allTournaments.length,
    open_tournaments: allTournaments.filter(t => t.status === 'open').length,
    in_progress_tournaments: allTournaments.filter(t => t.status === 'in_progress').length,
    completed_tournaments: allTournaments.filter(t => t.status === 'completed').length,
    total_users: allUsers.length,
    total_teams: allTeams.length,
    total_sports: allSports.length
  };

  auth.logAudit('VIEW_ADMIN_DASHBOARD', 'System', 'DASHBOARD', 'Truy cập Admin KPI Dashboard', adminEmail);

  return {
    kpis: kpis,
    tournaments: allTournaments,
    users: allUsers,
    sports: allSports,
    auditLogs: allAudits
  };
}

function apiAdminUpdateUserRole(targetEmail, systemRole, passcode) {
  const auth = getAuthService();
  const adminEmail = auth.checkSystemAdminAccess(passcode);
  const userRepo = new BaseRepository('User', 'user_id');
  const cleanEmail = String(targetEmail).toLowerCase().trim();

  const user = userRepo.findOne(u => String(u.email).toLowerCase().trim() === cleanEmail);
  if (!user) {
    throw new Error('Không tìm thấy người dùng với email: ' + targetEmail);
  }

  userRepo.update(user.user_id, { system_role: systemRole });
  auth.logAudit('UPDATE_USER_SYSTEM_ROLE', 'User', user.user_id, `Cập nhật vai trò hệ thống của ${cleanEmail} thành ${systemRole}`, adminEmail);
  return { success: true, message: `Đã cập nhật vai trò ${systemRole} cho ${cleanEmail}` };
}

function apiAdminAddSport(sportData, passcode) {
  const auth = getAuthService();
  const adminEmail = auth.checkSystemAdminAccess(passcode);
  const sportRepo = new BaseRepository('Sport', 'sport_id');

  const newSport = {
    sport_id: sportData.sport_id || generateId('S'),
    name: sportData.name,
    type: sportData.type || 'team',
    scoring_type: sportData.scoring_type || 'goals',
    min_players: Number(sportData.min_players) || 1,
    max_players: Number(sportData.max_players) || 1,
    has_skill_level: sportData.has_skill_level ? true : false,
    categories: Array.isArray(sportData.categories) ? JSON.stringify(sportData.categories) : (sportData.categories || '[]'),
    default_levels: Array.isArray(sportData.default_levels) ? JSON.stringify(sportData.default_levels) : (sportData.default_levels || '[]'),
    is_active: sportData.is_active !== false
  };

  sportRepo.insert(newSport);
  auth.logAudit('ADD_SPORT', 'Sport', newSport.sport_id, `Thêm môn thể thao mới: ${newSport.name}`, adminEmail);
  return newSport;
}

function apiAdminUpdateSport(sportId, sportData, passcode) {
  const auth = getAuthService();
  const adminEmail = auth.checkSystemAdminAccess(passcode);
  const sportRepo = new BaseRepository('Sport', 'sport_id');

  const updated = sportRepo.update(sportId, sportData);
  auth.logAudit('UPDATE_SPORT', 'Sport', sportId, `Cập nhật môn ${sportId}`, adminEmail);
  return updated;
}

function apiAdminDeleteTournament(tournamentId, passcode) {
  const auth = getAuthService();
  const adminEmail = auth.checkSystemAdminAccess(passcode);
  const tourRepo = new BaseRepository('Tournament', 'tournament_id');

  const t = tourRepo.getById(tournamentId);
  if (!t) throw new Error('Không tìm thấy giải đấu: ' + tournamentId);

  tourRepo.delete(tournamentId);
  auth.logAudit('ADMIN_DELETE_TOURNAMENT', 'Tournament', tournamentId, `Xóa giải đấu: ${t.name}`, adminEmail);
  return { success: true, message: `Đã xóa thành công giải đấu ${t.name}` };
}
