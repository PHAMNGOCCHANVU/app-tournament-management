/**
 * Auth.js - Pure Tournament-Scoped Role-Based Access Control (RBAC)
 * Vai trò ở cấp hệ thống: Mọi tài khoản Google đều bình đẳng
 * Vai trò ở cấp giải đấu: Organizer (Người tạo giải), Referee (Trọng tài), Player (VĐV), Viewer (Người xem)
 */

class AuthService {
  get userRepo() { return new BaseRepository('User', 'user_id'); }
  get roleRepo() { return new BaseRepository('TournamentRole', 'role_id'); }
  get tournamentRepo() { return new BaseRepository('Tournament', 'tournament_id'); }
  get teamRepo() { return new BaseRepository('Team', 'team_id'); }
  get playerRepo() { return new BaseRepository('Player', 'player_id'); }

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

    // 2. Kiểm tra vai trò được gán tường minh trong sheet TournamentRole (VD: referee)
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
    if (!['organizer', 'referee', 'player'].includes(role)) {
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
   * Kiểm tra quyền thực thi API ở cấp giải đấu
   */
  checkPermission(tournamentId, allowedRoles) {
    const email = this.getCurrentUserEmail();
    const role = this.getUserRole(tournamentId, email);

    if (!allowedRoles.includes(role)) {
      throw new Error(`Bạn không có quyền thực hiện thao tác này ở giải đấu. Quyền hiện tại: ${role}. Quyền yêu cầu: ${allowedRoles.join(', ')}`);
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
  auth.checkPermission(tournamentId, ['organizer']);
  const currentEmail = auth.getCurrentUserEmail();
  return auth.assignRole(tournamentId, targetEmail, role, currentEmail);
}

function apiRevokeRole(tournamentId, targetEmail, role) {
  const auth = getAuthService();
  auth.checkPermission(tournamentId, ['organizer']);
  const currentEmail = auth.getCurrentUserEmail();
  return auth.revokeRole(tournamentId, targetEmail, role, currentEmail);
}

function apiGetAssignedRoles(tournamentId) {
  return getAuthService().getAssignedRoles(tournamentId);
}
