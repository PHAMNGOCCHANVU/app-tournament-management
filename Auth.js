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

    if (existing) {
      return this.roleRepo.update(existing.role_id, {
        role: normalizedRole,
        assigned_at: new Date().toISOString(),
        assigned_by: assignedBy || currentEmail
      });
    }

    const newRole = {
      role_id: generateId('TR'),
      tournament_id: tournamentId,
      user_email: cleanEmail,
      role: normalizedRole,
      assigned_at: new Date().toISOString(),
      assigned_by: assignedBy || currentEmail
    };
    return this.roleRepo.insert(newRole);
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
  const role = auth.getUserRole(tournamentId, email);

  if (email) {
    auth.registerUser(email);
  }

  return {
    email: email,
    role: role,
    isLoggedIn: !!email
  };
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
