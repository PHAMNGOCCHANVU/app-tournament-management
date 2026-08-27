const gas = require('gas-local');
const path = require('path');

// Setup mock for Google Apps Script environment
const mockSpreadsheet = {
  sheets: {},
  getSheetByName(name) {
    return this.sheets[name] || null;
  },
  insertSheet(name) {
    if (!this.sheets[name]) {
      this.sheets[name] = {
        name: name,
        data: [],
        getLastRow() {
          return this.data.length;
        },
        getLastColumn() {
          if (this.data.length === 0) return 0;
          return this.data[0].length;
        },
        appendRow(row) {
          this.data.push([...row]);
          return this;
        },
        getRange(row, col, numRows, numCols) {
          if (numRows === undefined) numRows = 1;
          if (numCols === undefined) numCols = 1;
          const sheet = this;
          return {
            getValues() {
              const values = [];
              for (let r = 0; r < numRows; r++) {
                const rowIndex = row - 1 + r;
                const rowData = sheet.data[rowIndex] || [];
                const rowVals = [];
                for (let c = 0; c < numCols; c++) {
                  const colIndex = col - 1 + c;
                  rowVals.push(rowData[colIndex] === undefined ? '' : rowData[colIndex]);
                }
                values.push(rowVals);
              }
              return values;
            },
            setValues(values) {
              for (let r = 0; r < values.length; r++) {
                const rowIndex = row - 1 + r;
                if (!sheet.data[rowIndex]) {
                  sheet.data[rowIndex] = [];
                }
                for (let c = 0; c < values[r].length; c++) {
                  const colIndex = col - 1 + c;
                  sheet.data[rowIndex][colIndex] = values[r][c];
                }
              }
              return this;
            },
            setFontWeight(weight) { return this; },
            setBackground(color) { return this; }
          };
        },
        deleteRow(rowPosition) {
          const index = rowPosition - 1;
          if (index >= 0 && index < this.data.length) {
            this.data.splice(index, 1);
          }
          return this;
        }
      };
    }
    return this.sheets[name];
  }
};

const mockContext = {
  Logger: {
    log: jest.fn()
  },
  Utilities: {
    getUuid: () => Math.random().toString(36).substring(2, 14),
    formatString: (format, ...args) => require('util').format(format, ...args),
    formatDate: (date, tz, format) => date.toISOString()
  },
  Session: {
    getActiveUser: () => ({
      getEmail: () => mockContext.currentUserEmail
    })
  },
  SpreadsheetApp: {
    getActiveSpreadsheet: () => mockSpreadsheet
  },
  GmailApp: {
    sendEmail: jest.fn()
  },
  currentUserEmail: 'organizer@test.com'
};

// Load code files with filter to only load root js files
const absoluteWorkspaceDir = path.resolve(__dirname, '..');
const myLib = gas.require(absoluteWorkspaceDir, mockContext, {
  filter: (f) => {
    const dir = path.dirname(f);
    const normalizedDir = path.normalize(dir);
    const normalizedRoot = path.normalize(absoluteWorkspaceDir);
    return normalizedDir === normalizedRoot && path.extname(f) === '.js';
  }
});

// All global services (getAuthService, getTeamService, etc.) are automatically defined in the shared VM context by gas-local during loading.
// Because ES6 'class', 'const', and 'let' declarations do not attach to the global 'this' in a VM context, we expose them manually.
const vm = require('vm');
vm.runInContext('this.BaseRepository = BaseRepository; this.SCHEMAS = SCHEMAS; this.CACHE_STORE = CACHE_STORE;', myLib);

describe('SPORT TOURNAMENT V3 TEST PLAN EXECUTION SUITE', () => {
  let tsIdFootball, tsIdMensDoubles, tsIdMixedDoubles;
  const tournamentId = 'T001';

  beforeAll(() => {
    // 1. Reset mock sheets
    mockSpreadsheet.sheets = {};
    
    // 2. Initialize Database & Seed data
    myLib.setupDatabase();
  });

  describe('Database Setup & Schema Migration Verification', () => {
    test('DB initialization should populate Sport seed data and update headers', () => {
      const sportRepo = new myLib.BaseRepository('Sport', 'sport_id');
      const sports = sportRepo.getAll();
      expect(sports.length).toBeGreaterThan(0);
      
      const football = sports.find(s => s.sport_id === 'S001');
      expect(football).toBeDefined();
      expect(JSON.parse(football.categories)).toContain('mens');
      expect(JSON.parse(football.positions)).toContain('goalkeeper');
    });
    test('Migration test: setupDatabase should overwrite headers of existing sheets', () => {
      // Simulate an existing sheet from v2 with missing headers
      const testSheet = mockSpreadsheet.insertSheet('Sport');
      testSheet.data = [['sport_id', 'name']]; // only v2 headers
      new myLib.BaseRepository('Sport', 'sport_id').clearCache();
      
      myLib.setupDatabase();
      
      // Verification: header row should be updated to v3 layout
      expect(testSheet.data[0]).toEqual(myLib.SCHEMAS.Sport);
    });
  });

  describe('Module 1: Logic Đăng ký Chuyên biệt theo môn (Sport-specific Registration)', () => {
    beforeAll(() => {
      // Setup a test tournament
      const tRepo = new myLib.BaseRepository('Tournament', 'tournament_id');
      tRepo.insert({
        tournament_id: tournamentId,
        name: 'Giải vô địch Quốc gia 2026',
        organizer_email: 'organizer@test.com',
        status: 'open'
      });

      const tsRepo = new myLib.BaseRepository('TournamentSport', 'ts_id');
      // TS for Badminton Doubles Mens
      tsIdMensDoubles = 'TS001';
      tsRepo.insert({
        ts_id: tsIdMensDoubles,
        tournament_id: tournamentId,
        sport_id: 'S004', // Cầu lông đôi
        category: 'mens_doubles',
        skill_level: 'A',
        max_teams: 8,
        status: 'open'
      });

      // TS for Badminton Doubles Mixed
      tsIdMixedDoubles = 'TS002';
      tsRepo.insert({
        ts_id: tsIdMixedDoubles,
        tournament_id: tournamentId,
        sport_id: 'S004',
        category: 'mixed_doubles',
        skill_level: 'B',
        max_teams: 8,
        status: 'open'
      });

      // TS for Football
      tsIdFootball = 'TS003';
      tsRepo.insert({
        ts_id: tsIdFootball,
        tournament_id: tournamentId,
        sport_id: 'S001', // Bóng đá 7 người
        category: 'open',
        skill_level: '',
        max_teams: 8,
        status: 'open'
      });
    });

    test('TC_REG_01: Đăng ký Đôi Nam (Cầu lông/Pickleball) hợp lệ', () => {
      mockContext.currentUserEmail = 'captain@test.com';
      const registerData = {
        ts_id: tsIdMensDoubles,
        name: 'Đôi Nam Hà Nội',
        captain_email: 'captain@test.com',
        players: [
          { name: 'Nguyễn Văn A', email: 'captain@test.com', gender: 'male', phone: '0901234567', jersey_number: '1' },
          { name: 'Trần Văn B', email: 'partner@test.com', gender: 'male', phone: '0901234568', jersey_number: '2' }
        ]
      };

      const result = myLib.apiRegisterTeam(registerData);
      expect(result.team_id).toBeDefined();
      expect(result.status).toBe('pending');
    });

    test('TC_REG_02: Đăng ký Đôi Nam vi phạm giới tính (có Nữ)', () => {
      mockContext.currentUserEmail = 'captain@test.com';
      const registerData = {
        ts_id: tsIdMensDoubles,
        name: 'Đôi Nam Nữ Sai Hạng',
        captain_email: 'captain@test.com',
        players: [
          { name: 'Nguyễn Văn A', email: 'captain@test.com', gender: 'male', phone: '0901234567', jersey_number: '1' },
          { name: 'Nguyễn Thị C', email: 'partner2@test.com', gender: 'female', phone: '0901234569', jersey_number: '2' }
        ]
      };

      expect(() => {
        myLib.apiRegisterTeam(registerData);
      }).toThrow('Hạng mục Đôi Nam / Đơn Nam chỉ dành cho VĐV Nam.');
    });

    test('TC_REG_03: Đăng ký Đôi Nam Nữ (Mixed Doubles) hợp lệ', () => {
      mockContext.currentUserEmail = 'captain_mixed@test.com';
      const registerData = {
        ts_id: tsIdMixedDoubles,
        name: 'Đôi Nam Nữ Sông Lam',
        captain_email: 'captain_mixed@test.com',
        players: [
          { name: 'Nguyễn Văn A', email: 'captain_mixed@test.com', gender: 'male', phone: '0901234567', jersey_number: '1' },
          { name: 'Nguyễn Thị C', email: 'partner2@test.com', gender: 'female', phone: '0901234569', jersey_number: '2' }
        ]
      };

      const result = myLib.apiRegisterTeam(registerData);
      expect(result.team_id).toBeDefined();
    });

    test('TC_REG_04: Đăng ký Đôi Nam Nữ vi phạm giới tính (2 Nam)', () => {
      mockContext.currentUserEmail = 'captain_mixed@test.com';
      const registerData = {
        ts_id: tsIdMixedDoubles,
        name: 'Đôi Nam Nữ Sai Cặp',
        captain_email: 'captain_mixed@test.com',
        players: [
          { name: 'Nguyễn Văn A', email: 'captain_mixed@test.com', gender: 'male', phone: '0901234567', jersey_number: '1' },
          { name: 'Trần Văn B', email: 'partner@test.com', gender: 'male', phone: '0901234568', jersey_number: '2' }
        ]
      };

      expect(() => {
        myLib.apiRegisterTeam(registerData);
      }).toThrow('Hạng mục Đôi Nam Nữ phải gồm đúng 1 Nam và 1 Nữ.');
    });

    test('TC_REG_05: Đăng ký Bóng đá thiếu Thủ môn (FIFA rules)', () => {
      mockContext.currentUserEmail = 'fc_captain@test.com';
      const registerData = {
        ts_id: tsIdFootball,
        name: 'FC Thiếu Thủ Môn',
        captain_email: 'fc_captain@test.com',
        players: [
          { name: 'VĐV 1', email: 'c1@g.com', gender: 'male', position: 'defender', jersey_number: '1' },
          { name: 'VĐV 2', email: 'c2@g.com', gender: 'male', position: 'midfielder', jersey_number: '2' },
          { name: 'VĐV 3', email: 'c3@g.com', gender: 'male', position: 'forward', jersey_number: '3' },
          { name: 'VĐV 4', email: 'c4@g.com', gender: 'male', position: 'defender', jersey_number: '4' },
          { name: 'VĐV 5', email: 'c5@g.com', gender: 'male', position: 'midfielder', jersey_number: '5' },
          { name: 'VĐV 6', email: 'c6@g.com', gender: 'male', position: 'forward', jersey_number: '6' },
          { name: 'VĐV 7', email: 'c7@g.com', gender: 'male', position: 'forward', jersey_number: '7' }
        ]
      };

      expect(() => {
        myLib.apiRegisterTeam(registerData);
      }).toThrow('Đội thi đấu môn Bóng đá 7 người bắt buộc phải có ít nhất 1 Thủ môn (Goalkeeper).');
    });

    test('TC_REG_06: Trùng số áo trong đội hình', () => {
      mockContext.currentUserEmail = 'fc_captain@test.com';
      const registerData = {
        ts_id: tsIdFootball,
        name: 'FC Trùng Số Áo',
        captain_email: 'fc_captain@test.com',
        players: [
          { name: 'VĐV 1', email: 'c1@g.com', gender: 'male', position: 'goalkeeper', jersey_number: '10' },
          { name: 'VĐV 2', email: 'c2@g.com', gender: 'male', position: 'midfielder', jersey_number: '10' }, // Trùng
          { name: 'VĐV 3', email: 'c3@g.com', gender: 'male', position: 'forward', jersey_number: '3' },
          { name: 'VĐV 4', email: 'c4@g.com', gender: 'male', position: 'defender', jersey_number: '4' },
          { name: 'VĐV 5', email: 'c5@g.com', gender: 'male', position: 'midfielder', jersey_number: '5' },
          { name: 'VĐV 6', email: 'c6@g.com', gender: 'male', position: 'forward', jersey_number: '6' },
          { name: 'VĐV 7', email: 'c7@g.com', gender: 'male', position: 'forward', jersey_number: '7' }
        ]
      };

      expect(() => {
        myLib.apiRegisterTeam(registerData);
      }).toThrow('Số áo của các thành viên trong đội không được trùng nhau.');
    });

    test('TC_REG_07: Đăng ký Level thi đấu Hybrid', () => {
      mockContext.currentUserEmail = 'hybrid_captain@test.com';
      
      // Setup TournamentSport with a custom level
      const tsRepo = new myLib.BaseRepository('TournamentSport', 'ts_id');
      const tsIdHybrid = 'TS004';
      tsRepo.insert({
        ts_id: tsIdHybrid,
        tournament_id: tournamentId,
        sport_id: 'S003', // Cầu lông đơn
        category: 'mens_singles',
        skill_level: 'Cán bộ', // Custom skill level
        max_teams: 8,
        status: 'open'
      });

      const registerData = {
        ts_id: tsIdHybrid,
        name: 'VĐV Cán Bộ A',
        captain_email: 'hybrid_captain@test.com',
        players: [
          { name: 'VĐV Cán Bộ A', email: 'hybrid_captain@test.com', gender: 'male', phone: '0901', jersey_number: '1' }
        ]
      };

      const result = myLib.apiRegisterTeam(registerData);
      expect(result.team_id).toBeDefined();

      const savedTeam = new myLib.BaseRepository('Team', 'team_id').getById(result.team_id);
      expect(savedTeam.ts_id).toBe(tsIdHybrid);
    });
  });

  describe('Module 2: Phân quyền Giải đấu (Tournament-level RBAC)', () => {
    const editorEmail = 'editor@test.com';
    const otherUser = 'user_d@test.com';

    test('TC_EDT_01: Gán vai trò Editor cho giải đấu', () => {
      // Must be Organizer to assign role
      mockContext.currentUserEmail = 'organizer@test.com';
      const assigned = myLib.apiAssignRole(tournamentId, editorEmail, 'editor');
      
      expect(assigned).toBeDefined();
      expect(assigned.role).toBe('editor');
      expect(assigned.user_email).toBe(editorEmail);
    });

    test('TC_EDT_02: Quyền hạn Editor - Sửa thông tin giải đấu', () => {
      mockContext.currentUserEmail = editorEmail;
      
      // Editor should pass checkAction('edit_tournament')
      const check = myLib.apiCheckAction(tournamentId, 'edit_tournament');
      expect(check.role).toBe('editor');
    });

    test('TC_EDT_03: Chặn Editor duyệt đăng ký đội', () => {
      mockContext.currentUserEmail = editorEmail;
      
      expect(() => {
        myLib.apiCheckAction(tournamentId, 'approve_registration');
      }).toThrow('Bạn không có quyền thực hiện hành động "approve_registration" ở giải đấu. Vai trò hiện tại: editor.');
    });

    test('TC_EDT_04: Chặn Editor xóa giải đấu', () => {
      mockContext.currentUserEmail = editorEmail;

      expect(() => {
        myLib.apiCheckAction(tournamentId, 'delete_tournament');
      }).toThrow('Bạn không có quyền thực hiện hành động "delete_tournament" ở giải đấu. Vai trò hiện tại: editor.');
    });

    test('TC_EDT_05: Chặn Editor gán vai trò Referee', () => {
      mockContext.currentUserEmail = editorEmail;

      expect(() => {
        myLib.apiAssignRole(tournamentId, 'ref1@test.com', 'referee');
      }).toThrow('Bạn không có quyền thực hiện thao tác này ở giải đấu.');
    });

    test('TC_EDT_06: Chặn Editor tự phong/gán vai trò Editor', () => {
      mockContext.currentUserEmail = editorEmail;

      expect(() => {
        myLib.apiAssignRole(tournamentId, otherUser, 'editor');
      }).toThrow('Bạn không có quyền thực hiện thao tác này ở giải đấu.');
    });
  });

  describe('Module 3: Tính năng Import Đăng ký hàng loạt (Bulk Import Feature)', () => {
    test('TC_IMP_01: Import CSV môn đội hợp lệ', () => {
      mockContext.currentUserEmail = 'organizer@test.com';
      
      const csvRows = [
        { 'Tên Đội': 'Đội Bóng Đá A', 'Email Đội Trưởng': 'captain_fc_a@g.com', 'Tên VĐV': 'VĐV A1', 'Email VĐV': 'captain_fc_a@g.com', 'Giới tính': 'Nam', 'Số Áo': '1', 'Vị Trí': 'goalkeeper' },
        { 'Tên Đội': 'Đội Bóng Đá A', 'Email Đội Trưởng': 'captain_fc_a@g.com', 'Tên VĐV': 'VĐV A2', 'Email VĐV': 'a2@g.com', 'Giới tính': 'Nam', 'Số Áo': '2', 'Vị Trí': 'defender' },
        { 'Tên Đội': 'Đội Bóng Đá A', 'Email Đội Trưởng': 'captain_fc_a@g.com', 'Tên VĐV': 'VĐV A3', 'Email VĐV': 'a3@g.com', 'Giới tính': 'Nam', 'Số Áo': '3', 'Vị Trí': 'midfielder' },
        { 'Tên Đội': 'Đội Bóng Đá A', 'Email Đội Trưởng': 'captain_fc_a@g.com', 'Tên VĐV': 'VĐV A4', 'Email VĐV': 'a4@g.com', 'Giới tính': 'Nam', 'Số Áo': '4', 'Vị Trí': 'defender' },
        { 'Tên Đội': 'Đội Bóng Đá A', 'Email Đội Trưởng': 'captain_fc_a@g.com', 'Tên VĐV': 'VĐV A5', 'Email VĐV': 'a5@g.com', 'Giới tính': 'Nam', 'Số Áo': '5', 'Vị Trí': 'midfielder' },
        { 'Tên Đội': 'Đội Bóng Đá A', 'Email Đội Trưởng': 'captain_fc_a@g.com', 'Tên VĐV': 'VĐV A6', 'Email VĐV': 'a6@g.com', 'Giới tính': 'Nam', 'Số Áo': '6', 'Vị Trí': 'forward' },
        { 'Tên Đội': 'Đội Bóng Đá A', 'Email Đội Trưởng': 'captain_fc_a@g.com', 'Tên VĐV': 'VĐV A7', 'Email VĐV': 'a7@g.com', 'Giới tính': 'Nam', 'Số Áo': '7', 'Vị Trí': 'forward' }
      ];

      const res = myLib.apiImportTeamsFromCsv(tsIdFootball, csvRows);
      expect(res.success).toBe(true);
      expect(res.teams.length).toBe(1);
      
      const teamId = res.teams[0].team_id;
      const savedTeam = new myLib.BaseRepository('Team', 'team_id').getById(teamId);
      expect(savedTeam.status).toBe('approved'); // Auto approved
    });

    test('TC_IMP_02: Import CSV phát hiện lỗi dữ liệu (Thiếu Thủ Môn)', () => {
      mockContext.currentUserEmail = 'organizer@test.com';

      const csvRows = [
        { 'Tên Đội': 'Đội Lỗi Cấu Trúc', 'Email Đội Trưởng': 'captain_err@g.com', 'Tên VĐV': 'VĐV 1', 'Email VĐV': 'c1@g.com', 'Giới tính': 'Nam', 'Số Áo': '1', 'Vị Trí': 'defender' },
        { 'Tên Đội': 'Đội Lỗi Cấu Trúc', 'Email Đội Trưởng': 'captain_err@g.com', 'Tên VĐV': 'VĐV 2', 'Email VĐV': 'c2@g.com', 'Giới tính': 'Nam', 'Số Áo': '2', 'Vị Trí': 'midfielder' },
        { 'Tên Đội': 'Đội Lỗi Cấu Trúc', 'Email Đội Trưởng': 'captain_err@g.com', 'Tên VĐV': 'VĐV 3', 'Email VĐV': 'c3@g.com', 'Giới tính': 'Nam', 'Số Áo': '3', 'Vị Trí': 'forward' },
        { 'Tên Đội': 'Đội Lỗi Cấu Trúc', 'Email Đội Trưởng': 'captain_err@g.com', 'Tên VĐV': 'VĐV 4', 'Email VĐV': 'c4@g.com', 'Giới tính': 'Nam', 'Số Áo': '4', 'Vị Trí': 'defender' },
        { 'Tên Đội': 'Đội Lỗi Cấu Trúc', 'Email Đội Trưởng': 'captain_err@g.com', 'Tên VĐV': 'VĐV 5', 'Email VĐV': 'c5@g.com', 'Giới tính': 'Nam', 'Số Áo': '5', 'Vị Trí': 'midfielder' },
        { 'Tên Đội': 'Đội Lỗi Cấu Trúc', 'Email Đội Trưởng': 'captain_err@g.com', 'Tên VĐV': 'VĐV 6', 'Email VĐV': 'c6@g.com', 'Giới tính': 'Nam', 'Số Áo': '6', 'Vị Trí': 'forward' },
        { 'Tên Đội': 'Đội Lỗi Cấu Trúc', 'Email Đội Trưởng': 'captain_err@g.com', 'Tên VĐV': 'VĐV 7', 'Email VĐV': 'c7@g.com', 'Giới tính': 'Nam', 'Số Áo': '7', 'Vị Trí': 'forward' }
      ];

      const check = myLib.apiValidateImportData(tsIdFootball, csvRows);
      expect(check.valid).toBe(false);
      expect(check.errors[0]).toContain('bắt buộc phải có ít nhất 1 Thủ môn');
    });

    test('TC_IMP_03: Import bằng cách copy dữ liệu từ Google Sheets (Dạng Cặp - Đôi)', () => {
      mockContext.currentUserEmail = 'organizer@test.com';

      // Doubles layout: VĐV 1 & VĐV 2 inside the same row
      const sheetRows = [
        {
          'Tên Cặp': 'Cặp Đôi Cầu Lông Sông Hàn',
          'Tên VĐV 1': 'Nguyễn Văn A',
          'Email VĐV 1': 'captain@test.com',
          'Giới tính 1': 'Nam',
          'Tên VĐV 2': 'Trần Văn B',
          'Email VĐV 2': 'partner@test.com',
          'Giới tính 2': 'Nam'
        }
      ];

      const validation = myLib.apiValidateImportData(tsIdMensDoubles, sheetRows);
      expect(validation.valid).toBe(true);
      expect(validation.parsedTeams[0].players.length).toBe(2);
      expect(validation.parsedTeams[0].players[0].gender).toBe('male');
    });
  });
});
