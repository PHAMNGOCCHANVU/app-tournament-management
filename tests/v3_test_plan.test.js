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
    }),
    getEffectiveUser: () => ({
      getEmail: () => mockContext.effectiveUserEmail || 'admin@test.com'
    })
  },
  SpreadsheetApp: {
    getActiveSpreadsheet: () => mockSpreadsheet
  },
  GmailApp: {
    sendEmail: jest.fn()
  },
  currentUserEmail: 'organizer@test.com',
  effectiveUserEmail: 'admin@test.com'
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
vm.runInContext('this.BaseRepository = BaseRepository; this.SCHEMAS = SCHEMAS; this.CACHE_STORE = CACHE_STORE; this.SeededDraw = SeededDraw; this.FullRandomDraw = FullRandomDraw; this.STANDARD_ATHLETE_LEVELS = STANDARD_ATHLETE_LEVELS; this.LEVEL_GROUPS = LEVEL_GROUPS;', myLib);

describe('SPORT TOURNAMENT V3 TEST PLAN EXECUTION SUITE', () => {
  let tsIdFootball, tsIdMensDoubles, tsIdMixedDoubles;
  const tournamentId = 'T001';

  beforeAll(() => {
    // 1. Reset mock sheets
    mockSpreadsheet.sheets = {};
    
    // 2. Initialize Database & Seed data
    myLib.setupDatabase();

    // 3. Initialize EventBus Subscriptions
    myLib.initEventListeners();
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
      // TS for Badminton Doubles Mens (Option 2: Sport S003 with category mens_doubles)
      tsIdMensDoubles = 'TS001';
      tsRepo.insert({
        ts_id: tsIdMensDoubles,
        tournament_id: tournamentId,
        sport_id: 'S003', // Cầu lông (Option 2)
        category: 'mens_doubles',
        skill_level: 'A',
        max_teams: 8,
        status: 'open',
        points_for_win: 3,
        points_for_draw: 0,
        points_for_loss: 0,
        points_target_per_set: 21
      });

      // TS for Badminton Doubles Mixed (Option 2: Sport S003 with category mixed_doubles)
      tsIdMixedDoubles = 'TS002';
      tsRepo.insert({
        ts_id: tsIdMixedDoubles,
        tournament_id: tournamentId,
        sport_id: 'S003', // Cầu lông (Option 2)
        category: 'mixed_doubles',
        skill_level: 'B',
        max_teams: 8,
        status: 'open',
        points_for_win: 3,
        points_for_draw: 0,
        points_for_loss: 0,
        points_target_per_set: 21
      });

      // TS for Football (Option 2: Sport S001)
      tsIdFootball = 'TS003';
      tsRepo.insert({
        ts_id: tsIdFootball,
        tournament_id: tournamentId,
        sport_id: 'S001', // Bóng đá (Option 2)
        category: 'open',
        skill_level: '',
        max_teams: 8,
        status: 'open',
        points_for_win: 3,
        points_for_draw: 1,
        points_for_loss: 0
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
      }).toThrow('Đội thi đấu môn Bóng đá bắt buộc phải có ít nhất 1 Thủ môn (Goalkeeper).');
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
        sport_id: 'S003', // Cầu lông đơn (Option 2)
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

    test('TC_REG_OP2_01: Option 2 - Đăng ký Hạng mục Đơn với 2 VĐV bị chặn', () => {
      mockContext.currentUserEmail = 'singles_err@test.com';
      const registerData = {
        ts_id: 'TS004', // mens_singles
        name: 'Đơn Nam Sai Số Lượng',
        captain_email: 'singles_err@test.com',
        players: [
          { name: 'VĐV 1', email: 'singles_err@test.com', gender: 'male', phone: '0901', jersey_number: '1' },
          { name: 'VĐV 2', email: 'p2@test.com', gender: 'male', phone: '0902', jersey_number: '2' }
        ]
      };

      expect(() => {
        myLib.apiRegisterTeam(registerData);
      }).toThrow('Hạng mục Đơn bắt buộc phải có đúng 1 VĐV.');
    });

    test('TC_REG_OP2_02: Option 2 - Đăng ký Hạng mục Đôi với 1 VĐV bị chặn', () => {
      mockContext.currentUserEmail = 'doubles_err@test.com';
      const registerData = {
        ts_id: tsIdMensDoubles, // mens_doubles
        name: 'Đôi Nam Thiếu Người',
        captain_email: 'doubles_err@test.com',
        players: [
          { name: 'VĐV 1', email: 'doubles_err@test.com', gender: 'male', phone: '0901', jersey_number: '1' }
        ]
      };

      expect(() => {
        myLib.apiRegisterTeam(registerData);
      }).toThrow('Hạng mục Đôi bắt buộc phải có đúng 2 VĐV.');
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
      expect(check.errors[0]).toContain('bắt buộc phải có ít nhất 1 Thủ môn (Goalkeeper)');
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

  describe('Module 4: Option 2 - Deadline, Draw Points, Set Target & Multi-set Standings', () => {
    test('TC_OP2_01: Chặn Hạn chót đăng ký sau ngày bắt đầu giải đấu', () => {
      mockContext.currentUserEmail = 'organizer@test.com';
      
      const tRepo = new myLib.BaseRepository('Tournament', 'tournament_id');
      tRepo.insert({
        tournament_id: 'T_DEADLINE',
        name: 'Giải Test Deadline',
        start_date: '2026-10-10',
        organizer_email: 'organizer@test.com',
        status: 'open'
      });

      expect(() => {
        myLib.apiAddSportToTournament('T_DEADLINE', {
          sport_id: 'S005', // Pickleball
          format: 'round_robin',
          registration_deadline: '2026-10-15', // Sau ngày bắt đầu 2026-10-10
          max_teams: 8
        });
      }).toThrow('Hạn chót đăng ký không thể sau ngày bắt đầu giải đấu.');
    });

    test('TC_OP2_02: Môn Cầu lông/Bóng bàn/Pickleball tự động ép points_for_draw = 0', () => {
      mockContext.currentUserEmail = 'organizer@test.com';

      const ts = myLib.apiAddSportToTournament(tournamentId, {
        sport_id: 'S005', // Pickleball
        format: 'round_robin',
        category: 'mens_doubles',
        points_for_win: 3,
        points_for_draw: 1, // User passed 1, but system should force 0
        points_for_loss: 0,
        points_target_per_set: 11,
        max_teams: 8
      });

      expect(Number(ts.points_for_draw)).toBe(0);
      expect(Number(ts.points_target_per_set)).toBe(11);
    });

    test('TC_OP2_03: Tính điểm 3 Set thắng 2 và cập nhật BXH (Sets W/L, Points W/L)', () => {
      mockContext.currentUserEmail = 'organizer@test.com';

      // Create a TS for Pickleball
      const tsPb = myLib.apiAddSportToTournament(tournamentId, {
        sport_id: 'S005',
        format: 'round_robin',
        category: 'mens_doubles',
        points_for_win: 3,
        points_for_draw: 0,
        points_for_loss: 0,
        points_target_per_set: 11,
        max_teams: 4
      });

      // Register 2 teams
      const t1 = myLib.apiRegisterTeam({
        ts_id: tsPb.ts_id,
        name: 'Pickleball Team Alpha',
        captain_email: 'pb_a@test.com',
        players: [
          { name: 'PA 1', email: 'pb_a@test.com', gender: 'male' },
          { name: 'PA 2', email: 'pa2@test.com', gender: 'male' }
        ]
      });
      const t2 = myLib.apiRegisterTeam({
        ts_id: tsPb.ts_id,
        name: 'Pickleball Team Beta',
        captain_email: 'pb_b@test.com',
        players: [
          { name: 'PB 1', email: 'pb_b@test.com', gender: 'male' },
          { name: 'PB 2', email: 'pb2@test.com', gender: 'male' }
        ]
      });

      myLib.apiApproveTeam(t1.team_id);
      myLib.apiApproveTeam(t2.team_id);

      // Generate schedule
      myLib.apiGenerateFixtures(tsPb.ts_id);

      const matchRepo = new myLib.BaseRepository('Match', 'match_id');
      const matches = matchRepo.where('ts_id', tsPb.ts_id);
      expect(matches.length).toBeGreaterThan(0);

      const m = matches[0];
      // Team 1 wins Set 1 (11-8) and Set 2 (11-9) -> Best of 3 finish 2-0
      const scoreInput = {
        set1_a: 11, set1_b: 8,
        set2_a: 11, set2_b: 9,
        set3_a: 0, set3_b: 0,
        notes: 'Alpha wins 2-0'
      };

      const updated = myLib.apiUpdateMatchResult(m.match_id, 2, 0, 'Alpha wins 2-0', scoreInput);
      expect(updated.status).toBe('completed');
      expect(updated.winner_team_id).toBe(m.team1_id);

      // Check Standings
      const standings = myLib.apiGetRankingsByTournamentSport(tsPb.ts_id);
      expect(standings.length).toBe(2);

      const topRank = standings[0];
      expect(topRank.team_id).toBe(m.team1_id);
      expect(Number(topRank.won)).toBe(1);
      expect(Number(topRank.points)).toBe(3);
      expect(Number(topRank.sets_won)).toBe(2);
      expect(Number(topRank.sets_lost)).toBe(0);
      expect(Number(topRank.sets_diff)).toBe(2);
      expect(Number(topRank.points_for)).toBe(22);
      expect(Number(topRank.points_against)).toBe(17);
      expect(Number(topRank.points_diff)).toBe(5);
    });
  });

  describe('Module 5: Bug Fixes & Features Verification (BUG-1, BUG-2, BUG-3, F-2, F-3)', () => {
    test('BUG-3: Registration deadline should allow same-day registration and reject past dates', () => {
      const today = new Date();
      const pad = n => String(n).padStart(2, '0');
      const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

      const yesterday = new Date(today.getTime() - 24 * 3600 * 1000);
      const yesterdayStr = `${yesterday.getFullYear()}-${pad(yesterday.getMonth() + 1)}-${pad(yesterday.getDate())}`;

      const t = myLib.apiCreateTournament({
        name: 'Giải Test Deadline Bug 3',
        start_date: '2027-01-01',
        end_date: '2027-01-10',
        location: 'Sân Test Deadline',
        sports: [
          { sport_id: 'S004', registration_deadline: todayStr, format: 'round_robin', max_teams: 4, min_teams: 2 },
          { sport_id: 'S003', registration_deadline: yesterdayStr, format: 'round_robin', max_teams: 4, min_teams: 2 }
        ]
      });

      const tsToday = t.sports.find(s => s.sport_id === 'S004');
      const tsPast = t.sports.find(s => s.sport_id === 'S003');

      // Register today -> Must SUCCEED because deadline is end of today (23:59:59)
      const regSuccess = myLib.apiRegisterTeam({
        ts_id: tsToday.ts_id,
        name: 'Đội Hợp Lệ Hôm Nay',
        captain_email: 'today@test.com',
        players: [{ name: 'Player 1', gender: 'male' }]
      });
      expect(regSuccess.team_id).toBeDefined();

      // Register past -> Must FAIL
      expect(() => {
        myLib.apiRegisterTeam({
          ts_id: tsPast.ts_id,
          name: 'Đội Quá Hạn',
          captain_email: 'past@test.com',
          players: [{ name: 'Player 1', gender: 'male' }]
        });
      }).toThrow('Môn thi đấu này đã hết hạn đăng ký.');
    });

    test('BUG-1: Runtime Event Listener should auto-initialize and advance knockout bracket', () => {
      const t = myLib.apiCreateTournament({
        name: 'Giải Knockout Bug 1',
        start_date: '2027-02-01',
        end_date: '2027-02-10',
        location: 'Sân Knockout',
        sports: [{ sport_id: 'S004', format: 'single_elimination', max_teams: 4, min_teams: 4 }]
      });
      const tsId = t.sports[0].ts_id;

      const t1 = myLib.apiRegisterTeam({ ts_id: tsId, name: 'Team A', captain_email: 'a@test.com', players: [{ name: 'A' }] });
      const t2 = myLib.apiRegisterTeam({ ts_id: tsId, name: 'Team B', captain_email: 'b@test.com', players: [{ name: 'B' }] });
      const t3 = myLib.apiRegisterTeam({ ts_id: tsId, name: 'Team C', captain_email: 'c@test.com', players: [{ name: 'C' }] });
      const t4 = myLib.apiRegisterTeam({ ts_id: tsId, name: 'Team D', captain_email: 'd@test.com', players: [{ name: 'D' }] });

      myLib.apiApproveTeam(t1.team_id);
      myLib.apiApproveTeam(t2.team_id);
      myLib.apiApproveTeam(t3.team_id);
      myLib.apiApproveTeam(t4.team_id);

      const matches = myLib.apiGenerateFixtures(tsId, 'seeded');
      const round1Matches = matches.filter(m => m.round === 1);
      const finalMatch = matches.find(m => m.round === 2);
      expect(round1Matches.length).toBe(2);
      expect(finalMatch).toBeDefined();

      // Simulate a fresh V8 context where EVENT_REGISTRY is cleared
      myLib.clearEventListeners();

      // Update match result: Team A beats Team B
      const match1 = round1Matches[0];
      myLib.apiUpdateMatchResult(match1.match_id, 3, 1, 'Team A wins');

      // Verify that finalMatch was automatically advanced with Team A as one of the finalists
      const matchRepo = new myLib.BaseRepository('Match', 'match_id');
      const updatedFinal = matchRepo.getById(finalMatch.match_id);
      const hasAdvancedWinner = updatedFinal.team1_id === match1.team1_id || updatedFinal.team2_id === match1.team1_id;
      expect(hasAdvancedWinner).toBe(true);
    });

    test('F-2: points_for_loss should award points to losing team in standings', () => {
      const t = myLib.apiCreateTournament({
        name: 'Giải Point for Loss F2',
        start_date: '2027-03-01',
        end_date: '2027-03-10',
        location: 'Sân Point Loss',
        sports: [{
          sport_id: 'S004',
          format: 'round_robin',
          points_for_win: 3,
          points_for_draw: 0,
          points_for_loss: 1,
          max_teams: 2,
          min_teams: 2
        }]
      });
      const tsId = t.sports[0].ts_id;

      const t1 = myLib.apiRegisterTeam({ ts_id: tsId, name: 'Team Win', captain_email: 'win@test.com', players: [{ name: 'W' }] });
      const t2 = myLib.apiRegisterTeam({ ts_id: tsId, name: 'Team Loss', captain_email: 'loss@test.com', players: [{ name: 'L' }] });
      myLib.apiApproveTeam(t1.team_id);
      myLib.apiApproveTeam(t2.team_id);

      const matches = myLib.apiGenerateFixtures(tsId);
      const m = matches[0];
      myLib.apiUpdateMatchResult(m.match_id, 2, 0, 'Win 2-0');

      const standings = myLib.apiGetRankingsByTournamentSport(tsId);
      const winnerRow = standings.find(s => s.team_id === m.team1_id);
      const loserRow = standings.find(s => s.team_id === m.team2_id);

      expect(Number(winnerRow.points)).toBe(3);
      expect(Number(loserRow.points)).toBe(1); // Loss rewarded 1 point
    });

    test('F-3: Draw strategies should support Full Random and Seeded Draw', () => {
      const teams = [
        { team_id: 'TM1', seed: 2, name: 'Seed 2' },
        { team_id: 'TM2', seed: 1, name: 'Seed 1' },
        { team_id: 'TM3', seed: 0, name: 'Unseeded 1' },
        { team_id: 'TM4', seed: 0, name: 'Unseeded 2' }
      ];

      // SeededDraw keeps seed 1 first, seed 2 second
      const seededStrategy = new myLib.SeededDraw();
      const seededResult = seededStrategy.apply(teams);
      expect(seededResult[0].team_id).toBe('TM2'); // Seed 1
      expect(seededResult[1].team_id).toBe('TM1'); // Seed 2
      expect(seededResult.length).toBe(4);

      // FullRandomDraw contains all 4 teams
      const randomStrategy = new myLib.FullRandomDraw();
      const randomResult = randomStrategy.apply(teams);
      expect(randomResult.length).toBe(4);
      const teamIds = randomResult.map(t => t.team_id);
      expect(teamIds).toContain('TM1');
      expect(teamIds).toContain('TM2');
      expect(teamIds).toContain('TM3');
      expect(teamIds).toContain('TM4');
    });
  });

  describe('Features V4 Implementation Verification', () => {
    test('V4-1: Standardized 11-step athlete levels (1.0 to 6.0) and divisions', () => {
      expect(myLib.STANDARD_ATHLETE_LEVELS).toEqual([
        '1.0', '1.5', '2.0', '2.5', '3.0', '3.5', '4.0', '4.5', '5.0', '5.5', '6.0'
      ]);
      expect(myLib.STANDARD_ATHLETE_LEVELS.length).toBe(11);

      const sportRepo = new myLib.BaseRepository('Sport', 'sport_id');
      const sports = sportRepo.getAll();

      // Badminton S003, Table Tennis S004, Pickleball S005
      ['S003', 'S004', 'S005'].forEach(sportId => {
        const sp = sports.find(s => s.sport_id === sportId);
        expect(sp).toBeDefined();
        const levels = JSON.parse(sp.default_levels);
        expect(levels).toEqual(myLib.STANDARD_ATHLETE_LEVELS);
      });
    });

    test('V4-2: Tournament Payment Workflow & QR configuration', () => {
      // 1. Create a paid tournament
      const paidTournament = myLib.apiCreateTournament({
        name: 'V4 Cup Paid 2026',
        organizer_email: 'organizer@test.com',
        start_date: '2026-10-01',
        end_date: '2026-10-05',
        location: 'Ha Noi Stadium',
        fee_type: 'paid',
        entry_fee: 250000,
        bank_info: 'Vietcombank 123456789 - NGUYEN VAN A',
        qr_code_url: 'data:image/png;base64,mockqrdata',
        sports: [{
          sport_id: 'S003',
          format: 'single_elimination',
          max_teams: 4,
          min_teams: 2
        }]
      });

      expect(paidTournament.tournament_id).toBeDefined();
      expect(paidTournament.fee_type).toBe('paid');
      expect(Number(paidTournament.entry_fee)).toBe(250000);
      expect(paidTournament.bank_info).toContain('Vietcombank');
      expect(paidTournament.qr_code_url).toContain('mockqrdata');

      // 2. Update payment config
      myLib.apiUpdateTournamentPaymentConfig(paidTournament.tournament_id, {
        fee_type: 'paid',
        entry_fee: 300000,
        bank_info: 'MB Bank 987654321 - NGUYEN VAN A',
        qr_code_url: 'data:image/png;base64,updatedqr'
      });

      const updatedTour = myLib.apiGetTournamentById(paidTournament.tournament_id);
      expect(Number(updatedTour.entry_fee)).toBe(300000);
      expect(updatedTour.bank_info).toContain('MB Bank');

      // 3. Register team with athlete_level and payment_proof
      const tsId = updatedTour.sports[0].ts_id;
      const team = myLib.apiRegisterTeam({
        ts_id: tsId,
        name: 'Team Fee Paid',
        captain_email: 'fee.captain@gmail.com',
        athlete_level: '3.5',
        payment_proof: 'data:image/png;base64,receiptbillimage',
        players: [{ name: 'Player 1', email: 'fee.captain@gmail.com' }]
      });

      expect(team.team_id).toBeDefined();
      expect(team.athlete_level).toBe('3.5');
      expect(team.payment_status).toBe('unpaid');
      expect(team.payment_proof).toContain('receiptbillimage');

      // 4. Organizer verifies and confirms payment
      myLib.apiUpdateTeamPaymentStatus(team.team_id, 'paid');
      const teamRepo = new myLib.BaseRepository('Team', 'team_id');
      const confirmedTeam = teamRepo.getById(team.team_id);
      expect(confirmedTeam.payment_status).toBe('paid');
    });

    test('V4-3: Automated Email notification when Tournament starts (in_progress)', () => {
      mockContext.GmailApp.sendEmail.mockClear();

      // Start tournament T001
      myLib.apiUpdateTournamentStatus(tournamentId, 'in_progress');

      const tour = myLib.apiGetTournamentById(tournamentId);
      expect(tour.status).toBe('in_progress');
      expect(mockContext.GmailApp.sendEmail).toHaveBeenCalled();
    });

    test('V4-4: System Admin RBAC, Audit Log and Super Admin Dashboard', () => {
      // 1. Effective user is recognized as System Admin
      mockContext.currentUserEmail = 'admin@test.com';
      const adminInfo = myLib.apiIsSystemAdmin();
      expect(adminInfo.isAdmin).toBe(true);

      // 2. Super admin gets admin dashboard data
      const adminData = myLib.apiGetAdminDashboardData();
      expect(adminData.kpis).toBeDefined();
      expect(adminData.kpis.total_tournaments).toBeGreaterThan(0);
      expect(adminData.sports.length).toBeGreaterThan(0);
      expect(adminData.auditLogs).toBeDefined();

      // 3. Regular user is denied admin access
      mockContext.currentUserEmail = 'regular_user@test.com';
      expect(() => myLib.apiGetAdminDashboardData()).toThrow(/Từ chối truy cập/);

      // 4. Update user role (switch back to admin)
      mockContext.currentUserEmail = 'admin@test.com';
      const userRepo = new myLib.BaseRepository('User', 'user_id');
      const testUser = {
        user_id: 'U_TEST',
        email: 'user_target@test.com',
        display_name: 'Target User',
        created_at: new Date().toISOString()
      };
      userRepo.insert(testUser);

      myLib.apiAdminUpdateUserRole('user_target@test.com', 'organizer');
      const updatedUser = userRepo.findOne(u => u.email === 'user_target@test.com');
      expect(updatedUser.system_role).toBe('organizer');

      // 5. Audit Log has recorded entries
      const auditRepo = new myLib.BaseRepository('AuditLog', 'log_id');
      const allLogs = auditRepo.getAll();
      expect(allLogs.length).toBeGreaterThan(0);
      expect(allLogs.some(l => l.action === 'UPDATE_USER_SYSTEM_ROLE')).toBe(true);
    });
  });
});
