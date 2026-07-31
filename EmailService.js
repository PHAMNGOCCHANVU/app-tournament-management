/**
 * EmailService.gs - Notification Dispatcher using GmailApp
 */

class EmailService {
  get teamRepo() { return new BaseRepository('Team', 'team_id'); }
  get tsRepo() { return new BaseRepository('TournamentSport', 'ts_id'); }
  get tournamentRepo() { return new BaseRepository('Tournament', 'tournament_id'); }
  get sportRepo() { return new BaseRepository('Sport', 'sport_id'); }
  get playerRepo() { return new BaseRepository('Player', 'player_id'); }

  /**
   * Send Email Helper with fallback log
   */
  sendEmail(to, subject, htmlBody) {
    if (!to) return;
    try {
      GmailApp.sendEmail(to, subject, '', {
        htmlBody: htmlBody,
        name: 'Hệ thống Quản lý Giải đấu Thể thao'
      });
      Logger.log(`Sent email to ${to}: ${subject}`);
    } catch (e) {
      Logger.log(`Lỗi khi gửi email đến ${to}: ${e.message}`);
    }
  }

  /**
   * Send Registration Confirmation Email to Captain
   */
  sendRegistrationConfirmation(teamId) {
    const team = this.teamRepo.getById(teamId);
    if (!team || !team.captain_email) return;

    const ts = this.tsRepo.getById(team.ts_id);
    const tournament = ts ? this.tournamentRepo.getById(ts.tournament_id) : null;
    const sport = ts ? this.sportRepo.getById(ts.sport_id) : null;

    const subject = `[Xác nhận đăng ký] Đội ${team.name} tham gia giải ${tournament ? tournament.name : ''}`;
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
        <h2 style="color: #4f46e5; margin-top: 0;">Xác nhận Đăng ký Tham gia Giải đấu</h2>
        <p>Xin chào <strong>${team.captain_email}</strong>,</p>
        <p>Đội/Cá nhân <strong>${team.name}</strong> đã đăng ký thành công tham gia giải đấu thể thao!</p>
        
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Giải đấu:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${tournament ? tournament.name : ''}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Môn thi đấu:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${sport ? sport.name : ''}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Trạng thái:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;"><span style="color: #d97706; font-weight: bold;">Chờ Ban tổ chức duyệt</span></td></tr>
        </table>
        
        <p>Ban tổ chức sẽ kiểm tra và duyệt đăng ký của bạn trong thời gian sớm nhất.</p>
        <p style="margin-top: 30px; font-size: 12px; color: #6b7280;">Email này được gửi tự động từ Hệ thống Quản lý Giải đấu Thể thao.</p>
      </div>
    `;

    this.sendEmail(team.captain_email, subject, htmlBody);
  }

  /**
   * Send Match Schedule Notification to All Approved Captains
   */
  sendMatchScheduleNotification(tsId) {
    const ts = this.tsRepo.getById(tsId);
    if (!ts) return;

    const tournament = this.tournamentRepo.getById(ts.tournament_id);
    const sport = this.sportRepo.getById(ts.sport_id);

    const approvedTeams = this.teamRepo.where('ts_id', tsId).filter(t => t.status === 'approved');
    const recipientEmails = [...new Set(approvedTeams.map(t => t.captain_email).filter(Boolean))];

    if (recipientEmails.length === 0) return;

    const subject = `[Thông báo Lịch thi đấu] ${tournament ? tournament.name : ''} - Môn ${sport ? sport.name : ''}`;
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
        <h2 style="color: #10b981; margin-top: 0;">Lịch thi đấu đã được khởi tạo!</h2>
        <p>Kính gửi Ban huấn luyện và Vận động viên,</p>
        <p>Lịch thi đấu môn <strong>${sport ? sport.name : ''}</strong> thuộc giải đấu <strong>${tournament ? tournament.name : ''}</strong> đã được sinh tự động.</p>
        <p>Vui lòng truy cập trang web ứng dụng để xem chi tiết lịch thi đấu và chuẩn bị tốt cho các trận đấu.</p>
        
        <p style="margin-top: 30px; font-size: 12px; color: #6b7280;">Chúc các đội thi đấu cống hiến và đạt kết quả tốt nhất!</p>
      </div>
    `;

    recipientEmails.forEach(email => {
      this.sendEmail(email, subject, htmlBody);
    });
  }
}

// Singleton Helper (global variable for V8 reliability)
let _emailServiceInstance = null;
function getEmailService() {
  if (!_emailServiceInstance) {
    _emailServiceInstance = new EmailService();
  }
  return _emailServiceInstance;
}
