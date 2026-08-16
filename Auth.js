/**
 * Auth.js - Tournament-Scoped RBAC (Phase 1)
 *
 * Note:
 * - Mục tiêu của Phase 1 chỉ là hoàn thiện quyền ở cấp giải đấu theo tài liệu AS04.
 * - Theo AS04, 5 vai trò được định nghĩa rõ: organizer, editor, referee, player, viewer.
 * - Permission matrix dưới đây giữ ở mức conservative, vì tài liệu không mô tả chi tiết
 *   quyền từng role với từng action ở mọi trường hợp. Khi không rõ, ưu tiên deny.
 */

const TOURNAMENT_ROLE_PERMISSIONS = {
  organizer: [
    'view_tournament',
    'edit_tournament',
    'assign_role',
    'approve_registration',
    'reject_registration',
    'update_match_result',
    'delete_tournament'
  ],
  editor: [
    'view_tournament',
    'edit_tournament'
  ],
  referee: [
    'view_tournament',
    'update_match_result'
  ],
  player: [
    'view_tournament'
  ],
  viewer: [
    'view_tournament'
  ]
};

class AuthService {
  get userRepo() { return new BaseRepository('User', 'user_id'); }
  get roleRepo() { return new BaseRepository('TournamentRole', 'role_id'); }
  get tournamentRepo() { return new BaseRepository('Tournament', 'tournament_id'); }
  get teamRepo() { return new BaseRepository('Team', 'team_id'); }
  get playerRepo() { return new BaseRepository('Player', 'player_id'); }
  get configRepo() { return new BaseRepository('SystemConfig', 'config_id'); }
  get auditRepo() { return new BaseRepository('AuditLog', 'log_id'); }

  /**
   * Central permission matrix for tournament-level RBAC.
   */
  get permissionMatrix() {
    return TOURNAMENT_ROLE_PERMISSIONS;
  }

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
   * Seed default system-level config keys required by AS04.
   */
  ensureSystemConfigSeed() {
    const defaults = {
      allow_user_create_tournament: 'true',
      default_user_status: 'pending',
      default_system_role: 'user'
    };

    Object.keys(defaults).forEach(key => {
      const existing = this.configRepo.findOne(cfg => String(cfg.config_key || '').trim().toLowerCase() === String(key).trim().toLowerCase());
      if (!existing) {
        this.configRepo.insert({
          config_id: generateId('CFG'),
          config_key: key,
          config_value: String(defaults[key]),
          description: key === 'allow_user_create_tournament'
            ? 'Cho phép người dùng thông thường tạo giải đấu.'
            : 'Cấu hình mặc định cho vòng đời người dùng hệ thống.',
          updated_by: 'system',
          updated_at: new Date().toISOString()
        });
      }
    });
  }

  getSystemConfig(key, defaultValue = '') {
    this.ensureSystemConfigSeed();
    const record = this.configRepo.findOne(cfg => String(cfg.config_key || '').trim().toLowerCase() === String(key).trim().toLowerCase());
    if (!record) return defaultValue;
    const value = String(record.config_value ?? defaultValue);
    return value;
  }

  setSystemConfig(key, value, updatedBy = 'system') {
    const normalizedKey = String(key || '').trim();
    if (!normalizedKey) throw new Error('Thiếu tên cấu hình hệ thống.');

    const existing = this.configRepo.findOne(cfg => String(cfg.config_key || '').trim().toLowerCase() === normalizedKey.toLowerCase());
    const payload = {
      config_key: normalizedKey,
      config_value: String(value),
      updated_by: updatedBy || 'system',
      updated_at: new Date().toISOString()
    };

    let result;
    if (existing) {
      result = this.configRepo.update(existing.config_id, payload);
    } else {
      result = this.configRepo.insert(Object.assign({
        config_id: generateId('CFG')
      }, payload, {
        description: `Cấu hình hệ thống: ${normalizedKey}`
      }));
    }

    this.logAuditEvent({
      userEmail: updatedBy || 'system',
      action: 'update_system_config',
      resourceType: 'SystemConfig',
      resourceId: existing ? existing.config_id : (result && result.config_id) || normalizedKey,
      details: `Set ${normalizedKey} = ${String(value)}`
    });

    return result;
  }

  logAuditEvent({ userEmail, action, resourceType, resourceId, details, ipAddress }) {
    try {
      this.auditRepo.insert({
        log_id: generateId('LOG'),
        timestamp: new Date().toISOString(),
        user_email: userEmail || '',
        action: action || 'unknown_action',
        resource_type: resourceType || 'system',
        resource_id: resourceId || '',
        details: details || '',
        ip_address: ipAddress || ''
      });
    } catch (e) {
      Logger.log('Audit log failed: ' + e.message);
    }
  }

  getAuditLogs(limit = 50) {
    const logs = this.auditRepo.getAll().sort((a, b) => {
      const ta = new Date(a.timestamp || 0).getTime();
      const tb = new Date(b.timestamp || 0).getTime();
      return tb - ta;
    });
    return logs.slice(0, Number(limit) || 50);
  }

  getUserProfile(email) {
    if (!email) return null;
    const cleanEmail = String(email).toLowerCase().trim();
    return this.userRepo.findOne(u => String(u.email || '').toLowerCase().trim() === cleanEmail) || null;
  }

  isSystemAdmin(email) {
    const user = this.getUserProfile(email);
    const systemRole = String(user && user.system_role ? user.system_role : 'user').toLowerCase().trim();
    return ['admin', 'system_admin', 'super_admin'].includes(systemRole);
  }

  canCreateTournament(email) {
    const user = this.getUserProfile(email);
    const status = String(user && user.status ? user.status : this.getSystemConfig('default_user_status', 'pending')).toLowerCase().trim();
    const allowFlag = String(this.getSystemConfig('allow_user_create_tournament', 'true')).toLowerCase().trim();

    if (this.isSystemAdmin(email)) {
      return true;
    }

    if (status !== 'active') {
      return false;
    }

    return allowFlag === 'true' || allowFlag === '1' || allowFlag === 'yes';
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
      const existingUsers = this.userRepo.getAll();
      const defaultSystemRole = existingUsers.length === 0 ? 'admin' : this.getSystemConfig('default_system_role', 'user');
      const defaultStatus = existingUsers.length === 0 ? 'active' : this.getSystemConfig('default_user_status', 'pending');

      user = {
        user_id: generateId('U'),
        email: cleanEmail,
        display_name: displayName || cleanEmail.split('@')[0],
        picture_url: pictureUrl || '',
        system_role: defaultSystemRole,
        status: defaultStatus,
        approved_by: existingUsers.length === 0 ? 'system' : '',
        approved_at: existingUsers.length === 0 ? now : '',
        created_at: now,
        updated_at: now
      };
      this.userRepo.insert(user);
    } else {
      const updates = {};
      if (displayName && user.display_name !== displayName) updates.display_name = displayName;
      if (pictureUrl && user.picture_url !== pictureUrl) updates.picture_url = pictureUrl;
      if (!user.system_role) updates.system_role = this.getSystemConfig('default_system_role', 'user');
      if (!user.status) updates.status = this.getSystemConfig('default_user_status', 'pending');
      updates.updated_at = now;

      if (Object.keys(updates).length > 0) {
        user = this.userRepo.update(user.user_id, updates);
      }
    }
    return user;
  }

  updateUserStatus(email, status, approvedBy) {
    const cleanEmail = String(email || '').toLowerCase().trim();
    if (!cleanEmail) throw new Error('Email người dùng không hợp lệ.');

    const validStatuses = ['pending', 'active', 'rejected', 'suspended'];
    const normalizedStatus = String(status || '').toLowerCase().trim();
    if (!validStatuses.includes(normalizedStatus)) {
      throw new Error('Trạng thái người dùng không hợp lệ. Chỉ cho phép: pending, active, rejected, suspended.');
    }

    const user = this.getUserProfile(cleanEmail);
    if (!user) throw new Error('Không tìm thấy hồ sơ người dùng.');

    const updates = {
      status: normalizedStatus,
      updated_at: new Date().toISOString()
    };

    if (normalizedStatus === 'active') {
      updates.approved_by = approvedBy || 'system';
      updates.approved_at = new Date().toISOString();
    }

    const updated = this.userRepo.update(user.user_id, updates);
    this.logAuditEvent({
      userEmail: approvedBy || 'system',
      action: 'update_user_status',
      resourceType: 'User',
      resourceId: user.user_id,
      details: `Set status ${normalizedStatus} for ${cleanEmail}`
    });
    return updated;
  }

  setSystemRole(email, systemRole, changedBy) {
    const cleanEmail = String(email || '').toLowerCase().trim();
    if (!cleanEmail) throw new Error('Email người dùng không hợp lệ.');
    const normalizedRole = String(systemRole || '').toLowerCase().trim();
    const validRoles = ['user', 'admin', 'system_admin', 'super_admin'];
    if (!validRoles.includes(normalizedRole)) {
      throw new Error('Vai trò hệ thống không hợp lệ. Chỉ cho phép user, admin, system_admin, super_admin.');
    }

    const user = this.getUserProfile(cleanEmail);
    if (!user) throw new Error('Không tìm thấy hồ sơ người dùng.');

    const updated = this.userRepo.update(user.user_id, {
      system_role: normalizedRole,
      updated_at: new Date().toISOString()
    });

    this.logAuditEvent({
      userEmail: changedBy || 'system',
      action: 'update_system_role',
      resourceType: 'User',
      resourceId: user.user_id,
      details: `Set system role ${normalizedRole} for ${cleanEmail}`
    });
    return updated;
  }

  /**
   * Xác định vai trò duy nhất theo giải đấu.
   * Quy tắc ưu tiên:
   * 1. Organizer nếu email khớp tournament.organizer_email
   * 2. Explicit role từ TournamentRole nếu có
   * 3. Player chỉ khi user thuộc team của giải đã được approved
   * 4. Mặc định là viewer
   */
  getUserRole(tournamentId, userEmail) {
    const email = (userEmail || this.getCurrentUserEmail()).toLowerCase().trim();
    if (!email || !tournamentId) return 'viewer';

    const tournament = this.tournamentRepo.getById(tournamentId);
    if (tournament && String(tournament.organizer_email).toLowerCase().trim() === email) {
      return 'organizer';
    }

    const roleRecord = this.roleRepo.findOne(r =>
      String(r.tournament_id) === String(tournamentId) &&
      String(r.user_email).toLowerCase().trim() === email
    );
    if (roleRecord) {
      const normalizedRole = String(roleRecord.role || '').toLowerCase().trim();
      if (['organizer', 'editor', 'referee', 'player', 'viewer'].includes(normalizedRole)) {
        return normalizedRole;
      }
    }

    const tsRepo = new BaseRepository('TournamentSport', 'ts_id');
    const tournamentSports = tsRepo.where('tournament_id', tournamentId);
    const tsIds = tournamentSports.map(ts => ts.ts_id);
    const allTeams = this.teamRepo.getAll();
    const candidateTeams = allTeams.filter(t =>
      tsIds.includes(t.ts_id) &&
      String(t.status || '').toLowerCase() === 'approved'
    );

    if (candidateTeams.length > 0) {
      const isApprovedPlayer = candidateTeams.some(team => {
        const captainMatch = String(team.captain_email || '').toLowerCase().trim() === email;
        if (captainMatch) return true;

        return this.playerRepo.findOne(p =>
          String(p.team_id) === String(team.team_id) &&
          String(p.email || '').toLowerCase().trim() === email
        ) !== null;
      });

      if (isApprovedPlayer) {
        return 'player';
      }
    }

    return 'viewer';
  }

  /**
   * Gán vai trò cho người dùng trong giải đấu.
   * TournamentRole hỗ trợ 5 role theo Phase 1: organizer, editor, referee, player, viewer.
   * organizer được giữ hợp lệ và cũng có thể trùng với tournament.organizer_email.
   */
  assignRole(tournamentId, targetEmail, role, assignedBy) {
    const normalizedRole = String(role || '').toLowerCase().trim();
    const validRoles = ['organizer', 'editor', 'referee', 'player', 'viewer'];
    if (!validRoles.includes(normalizedRole)) {
      throw new Error('Vai trò không hợp lệ cho TournamentRole: ' + role + '. Chỉ cho phép organizer, editor, referee, player, viewer.');
    }

    const currentEmail = this.getCurrentUserEmail();
    if (!currentEmail) {
      throw new Error('Bạn chưa đăng nhập để thực hiện gán quyền.');
    }

    this.checkAction(tournamentId, 'assign_role');

    const cleanEmail = String(targetEmail || '').toLowerCase().trim();
    if (!cleanEmail) {
      throw new Error('Email người nhận vai trò không hợp lệ.');
    }

    const existing = this.roleRepo.findOne(r =>
      String(r.tournament_id) === String(tournamentId) &&
      String(r.user_email).toLowerCase().trim() === cleanEmail
    );

    let result;
    if (existing) {
      result = this.roleRepo.update(existing.role_id, {
        role: normalizedRole,
        assigned_at: new Date().toISOString(),
        assigned_by: assignedBy || currentEmail
      });
    } else {
      const newRole = {
        role_id: generateId('TR'),
        tournament_id: tournamentId,
        user_email: cleanEmail,
        role: normalizedRole,
        assigned_at: new Date().toISOString(),
        assigned_by: assignedBy || currentEmail
      };
      result = this.roleRepo.insert(newRole);
    }

    this.logAuditEvent({
      userEmail: assignedBy || currentEmail,
      action: 'assign_tournament_role',
      resourceType: 'TournamentRole',
      resourceId: String(tournamentId),
      details: `Assigned ${normalizedRole} to ${cleanEmail} in tournament ${tournamentId}`
    });
    return result;
  }

  /**
   * Thu hồi vai trò người dùng trong giải đấu.
   * TournamentRole hỗ trợ 5 role theo Phase 1: organizer, editor, referee, player, viewer.
   */
  revokeRole(tournamentId, targetEmail, role, revokedBy) {
    const normalizedRole = String(role || '').toLowerCase().trim();
    const validRoles = ['organizer', 'editor', 'referee', 'player', 'viewer'];
    if (normalizedRole && !validRoles.includes(normalizedRole)) {
      throw new Error('Vai trò không hợp lệ để thu hồi: ' + role + '. Chỉ cho phép organizer, editor, referee, player, viewer.');
    }

    const currentEmail = this.getCurrentUserEmail();
    if (!currentEmail) {
      throw new Error('Bạn chưa đăng nhập để thực hiện thu hồi quyền.');
    }

    this.checkAction(tournamentId, 'assign_role');

    const cleanEmail = String(targetEmail || '').toLowerCase().trim();
    if (!cleanEmail) {
      throw new Error('Email người bị thu hồi quyền không hợp lệ.');
    }

    const remaining = this.roleRepo.where('tournament_id', tournamentId);
    const toDelete = remaining.find(r =>
      String(r.user_email).toLowerCase().trim() === cleanEmail &&
      (!normalizedRole || String(r.role || '').toLowerCase().trim() === normalizedRole)
    );

    if (toDelete) {
      this.roleRepo.delete(toDelete.role_id);
    }

    this.logAuditEvent({
      userEmail: revokedBy || currentEmail,
      action: 'revoke_tournament_role',
      resourceType: 'TournamentRole',
      resourceId: String(tournamentId),
      details: `Revoked ${normalizedRole || 'role'} from ${cleanEmail} in tournament ${tournamentId}`
    });

    Logger.log(`Revoked role ${normalizedRole || 'any'} for ${targetEmail} in tournament ${tournamentId} by ${revokedBy || currentEmail}`);
    return { success: true, message: `Đã thu hồi quyền ${normalizedRole || 'đã gán'} của ${targetEmail}` };
  }

  /**
   * Lấy danh sách vai trò đã gán cho một Giải đấu
   */
  getAssignedRoles(tournamentId) {
    return this.roleRepo.where('tournament_id', tournamentId);
  }

  /**
   * Chỉ kiểm tra role-level không phải action-level.
   * Giữ nguyên để tương thích với các code cũ.
   */
  checkPermission(tournamentId, allowedRoles) {
    const email = this.getCurrentUserEmail();
    const role = this.getUserRole(tournamentId, email);

    if (!allowedRoles.includes(role)) {
      throw new Error(`Bạn không có quyền thực hiện thao tác này ở giải đấu. Quyền hiện tại: ${role}. Quyền yêu cầu: ${allowedRoles.join(', ')}`);
    }
    return { email, role };
  }

  /**
   * Action-based permission kiểm tra cho Tournament-level RBAC.
   * Tài liệu AS04 đã định nghĩa các action chính nhưng không mô tả đầy đủ permission matrix
   * kiểm tra theo từng role. Vì vậy chọn policy conservative: chỉ bảo toàn những action rõ ràng.
   */
  checkAction(tournamentId, action) {
    const normalizedAction = String(action || '').trim();
    if (!normalizedAction) {
      throw new Error('Tên action không hợp lệ.');
    }

    const email = this.getCurrentUserEmail();
    if (!email) {
      throw new Error('Bạn chưa đăng nhập để thực hiện thao tác này.');
    }

    const role = this.getUserRole(tournamentId, email);
    const allowedActions = this.permissionMatrix[role] || [];
    if (!allowedActions.includes(normalizedAction)) {
      throw new Error(`Bạn không có quyền "${normalizedAction}" trong giải đấu này. Vai trò hiện tại: ${role}.`);
    }

    return { email, role, action: normalizedAction };
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
 * Server Exposed APIs for Client
 */
function apiGetAuthContext(tournamentId) {
  const auth = getAuthService();
  const email = auth.getCurrentUserEmail();
  const profile = email ? auth.registerUser(email) : null;
  const role = auth.getUserRole(tournamentId, email);

  return {
    email: email,
    role: role,
    system_role: profile ? (profile.system_role || 'user') : 'user',
    status: profile ? (profile.status || 'pending') : 'pending',
    isLoggedIn: !!email,
    isAdmin: email ? auth.isSystemAdmin(email) : false,
    canCreateTournament: email ? auth.canCreateTournament(email) : false
  };
}

function apiGetSystemConfig(key, defaultValue) {
  return getAuthService().getSystemConfig(key, defaultValue || '');
}

function apiListAuditLogs(limit) {
  const currentUser = getAuthService().getCurrentUserEmail();
  if (!currentUser || !getAuthService().isSystemAdmin(currentUser)) {
    throw new Error('Chỉ Quản trị viên hệ thống mới có quyền xem audit log.');
  }
  return getAuthService().getAuditLogs(limit || 50);
}

function apiSetSystemConfig(key, value, updatedBy) {
  const currentUser = getAuthService().getCurrentUserEmail();
  if (!currentUser || !getAuthService().isSystemAdmin(currentUser)) {
    throw new Error('Chỉ Quản trị viên hệ thống mới có quyền cập nhật cấu hình hệ thống.');
  }
  return getAuthService().setSystemConfig(key, value, updatedBy || currentUser);
}

function apiGetUserProfile(email) {
  const currentUser = getAuthService().getCurrentUserEmail();
  if (!currentUser || !getAuthService().isSystemAdmin(currentUser)) {
    throw new Error('Chỉ Quản trị viên hệ thống mới có quyền xem hồ sơ người dùng.');
  }
  return getAuthService().getUserProfile(email);
}

function apiListUsersForAdmin() {
  const currentUser = getAuthService().getCurrentUserEmail();
  if (!currentUser || !getAuthService().isSystemAdmin(currentUser)) {
    throw new Error('Chỉ Quản trị viên hệ thống mới có quyền xem danh sách người dùng.');
  }
  return getAuthService().userRepo.getAll();
}

function apiApproveUser(email) {
  const currentUser = getAuthService().getCurrentUserEmail();
  if (!currentUser || !getAuthService().isSystemAdmin(currentUser)) {
    throw new Error('Chỉ Quản trị viên hệ thống mới có quyền phê duyệt người dùng.');
  }
  return getAuthService().updateUserStatus(email, 'active', currentUser);
}

function apiRejectUser(email) {
  const currentUser = getAuthService().getCurrentUserEmail();
  if (!currentUser || !getAuthService().isSystemAdmin(currentUser)) {
    throw new Error('Chỉ Quản trị viên hệ thống mới có quyền từ chối người dùng.');
  }
  return getAuthService().updateUserStatus(email, 'rejected', currentUser);
}

function apiSuspendUser(email) {
  const currentUser = getAuthService().getCurrentUserEmail();
  if (!currentUser || !getAuthService().isSystemAdmin(currentUser)) {
    throw new Error('Chỉ Quản trị viên hệ thống mới có quyền khóa người dùng.');
  }
  return getAuthService().updateUserStatus(email, 'suspended', currentUser);
}

function apiSetSystemRole(email, systemRole) {
  const currentUser = getAuthService().getCurrentUserEmail();
  if (!currentUser || !getAuthService().isSystemAdmin(currentUser)) {
    throw new Error('Chỉ Quản trị viên hệ thống mới có quyền cập nhật vai trò hệ thống.');
  }
  return getAuthService().setSystemRole(email, systemRole, currentUser);
}

function apiAssignRole(tournamentId, targetEmail, role) {
  const auth = getAuthService();
  auth.checkAction(tournamentId, 'assign_role');
  const currentEmail = auth.getCurrentUserEmail();
  return auth.assignRole(tournamentId, targetEmail, role, currentEmail);
}

function apiRevokeRole(tournamentId, targetEmail, role) {
  const auth = getAuthService();
  auth.checkAction(tournamentId, 'assign_role');
  const currentEmail = auth.getCurrentUserEmail();
  return auth.revokeRole(tournamentId, targetEmail, role, currentEmail);
}

function apiCheckAction(tournamentId, action) {
  return getAuthService().checkAction(tournamentId, action);
}

function apiGetAssignedRoles(tournamentId) {
  return getAuthService().getAssignedRoles(tournamentId);
}
