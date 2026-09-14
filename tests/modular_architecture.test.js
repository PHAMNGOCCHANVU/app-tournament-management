const gas = require('gas-local');
const path = require('path');
const vm = require('vm');

// Mock Spreadsheet for Testing
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
  UrlFetchApp: {
    fetch: jest.fn()
  },
  PropertiesService: {
    getScriptProperties: () => ({
      getProperty: (key) => {
        if (key === 'FIREBASE_URL') return 'https://test-tournament-livescore.firebaseio.com/';
        if (key === 'FIREBASE_SECRET') return 'my_secret_token_123';
        return null;
      }
    })
  },
  currentUserEmail: 'organizer@test.com'
};

const absoluteWorkspaceDir = path.resolve(__dirname, '..');
const myLib = gas.require(absoluteWorkspaceDir, mockContext, {
  filter: (f) => {
    const dir = path.dirname(f);
    const normalizedDir = path.normalize(dir);
    const normalizedRoot = path.normalize(absoluteWorkspaceDir);
    return normalizedDir === normalizedRoot && path.extname(f) === '.js';
  }
});

vm.runInContext(`
  this.BaseRepository = BaseRepository;
  this.SCHEMAS = SCHEMAS;
  this.CACHE_STORE = CACHE_STORE;
  this.SYSTEM_EVENTS = SYSTEM_EVENTS;
  this.MATCH_STATUS = MATCH_STATUS;
  this.TOURNAMENT_STATUS = TOURNAMENT_STATUS;
  this.TEAM_STATUS = TEAM_STATUS;
`, myLib);

describe('MODULAR MONOLITH REFACTOR VERIFICATION SUITE', () => {
  beforeAll(() => {
    mockSpreadsheet.sheets = {};
    myLib.setupDatabase();
    myLib.initEventListeners();
  });

  describe('Component 1: EventBus & Decoupled Pub/Sub', () => {
    test('emitEvent should notify registered listeners', () => {
      let receivedPayload = null;
      myLib.onEvent('CustomTestEvent', (payload) => {
        receivedPayload = payload;
      });

      myLib.emitEvent('CustomTestEvent', { testKey: 'testValue' });
      expect(receivedPayload).toEqual({ testKey: 'testValue' });
    });
  });

  describe('Component 2: Sport Score Strategy Engine (Strategy Pattern)', () => {
    let tournamentId, tsIdPickleball, matchId;

    beforeAll(() => {
      const t = myLib.apiCreateTournament({
        name: 'Pickleball Open Cup 2026',
        start_date: '2026-09-01',
        end_date: '2026-09-03',
        location: 'Sân Pickleball TP.HCM'
      });
      tournamentId = t.tournament_id;

      const ts = myLib.apiAddSportToTournament(tournamentId, {
        sport_id: 'S005', // Pickleball
        format: 'round_robin',
        min_teams: 2,
        max_teams: 4
      });
      tsIdPickleball = ts.ts_id;

      // Register 2 teams
      const teamA = myLib.apiRegisterTeam({
        ts_id: tsIdPickleball,
        name: 'Pickle Masters',
        players: [{ name: 'VĐV 1', gender: 'male' }, { name: 'VĐV 2', gender: 'female' }]
      });
      const teamB = myLib.apiRegisterTeam({
        ts_id: tsIdPickleball,
        name: 'Smash Kings',
        players: [{ name: 'VĐV 3', gender: 'male' }, { name: 'VĐV 4', gender: 'female' }]
      });

      myLib.apiApproveTeam(teamA.team_id);
      myLib.apiApproveTeam(teamB.team_id);

      const matches = myLib.apiGenerateFixtures(tsIdPickleball);
      matchId = matches[0].match_id;
    });

    test('Engine_Pickleball should calculate scores and store extra rotation data', () => {
      const result = myLib.getScoreEngineService().processScoreAction(matchId, {
        team1_score: 11,
        team2_score: 8,
        notes: 'Chạm 11 cách biệt 2',
        extra_data: { server_number: 2, position: 'A1-Right' }
      });

      expect(result.team1_score).toBe(11);
      expect(result.team2_score).toBe(8);
      expect(result.status).toBe(myLib.MATCH_STATUS.COMPLETED);

      // Verify standings were automatically calculated via MatchCompletedEvent
      const rankings = myLib.apiGetRankingsByTournamentSport(tsIdPickleball);
      expect(rankings.length).toBe(2);
      expect(rankings[0].won).toBe(1);
      expect(rankings[0].points).toBe(3);
    });
  });

  describe('Component 3: Batch Operations & High Performance DB Helper', () => {
    test('batchInsert should insert multiple records in a single setValues call', () => {
      const testRepo = new myLib.BaseRepository('Sport', 'sport_id');
      const countBefore = testRepo.getAll().length;

      const newSports = [
        { sport_id: 'S901', name: 'Tennis', type: 'individual' },
        { sport_id: 'S902', name: 'Bóng rổ 3x3', type: 'team' }
      ];

      testRepo.batchInsert(newSports);
      const countAfter = testRepo.getAll().length;

      expect(countAfter).toBe(countBefore + 2);
      expect(testRepo.getById('S901').name).toBe('Tennis');
    });
  });

  describe('Component 4: Payment Webhook Auto-Approval', () => {
    test('handlePaymentWebhook should auto approve pending team if ID matches transfer content', () => {
      const t = myLib.apiCreateTournament({
        name: 'Football Championship',
        start_date: '2026-10-01',
        end_date: '2026-10-05',
        location: 'Sân Cỏ Nhân Tạo'
      });

      const ts = myLib.apiAddSportToTournament(t.tournament_id, {
        sport_id: 'S001',
        format: 'round_robin',
        min_teams: 2,
        max_teams: 8
      });

      // Switch to non-organizer email to register as pending
      mockContext.currentUserEmail = 'captain_pending@test.com';

      const players = [];
      for (let i = 1; i <= 7; i++) {
        players.push({
          name: `Cầu thủ ${i}`,
          jersey_number: i,
          position: i === 1 ? 'goalkeeper' : 'defender'
        });
      }

      const team = myLib.apiRegisterTeam({
        ts_id: ts.ts_id,
        name: 'FC Payment Test',
        captain_email: 'captain_pending@test.com',
        players: players
      });

      expect(team.status).toBe(myLib.TEAM_STATUS.PENDING);

      // Webhook payload from Bank / Casso / Sepay
      const webhookPayload = {
        content: `Thanh toan le phi giai dau ma ${team.team_id}`,
        amount: 500000
      };

      const webhookResult = myLib.getTeamService().handlePaymentWebhook(webhookPayload);
      expect(webhookResult.success).toBe(true);

      const approvedTeam = myLib.getTeamService().getTeamById(team.team_id);
      expect(approvedTeam.status).toBe(myLib.TEAM_STATUS.APPROVED);
    });
  });

  describe('Component 5: Archiver & Tournament Closer', () => {
    test('closeTournament should lock tournament status to archived', () => {
      mockContext.currentUserEmail = 'organizer@test.com';

      const t = myLib.apiCreateTournament({
        name: 'Tournament To Close',
        start_date: '2026-11-01',
        end_date: '2026-11-02',
        location: 'Sân A'
      });

      const closed = myLib.apiCloseTournament(t.tournament_id);
      expect(closed.status).toBe(myLib.TOURNAMENT_STATUS.ARCHIVED);

      const summary = myLib.apiGetTournamentSummary(t.tournament_id);
      expect(summary.tournament.tournament_id).toBe(t.tournament_id);
      expect(summary.sports).toBeDefined();
    });
  });

  describe('Component 6: Pure Google Sheets Match Scoring & State Machine', () => {
    test('updateMatchResult updates match score and triggers progression calculation', () => {
      // 1. Create tournament, TS, approved teams and matches
      const tRepo = new myLib.BaseRepository('Tournament', 'tournament_id');
      const t = tRepo.insert({
        tournament_id: 'T_SHEET_01',
        name: 'Giải Đấu Thuần Google Sheets',
        organizer_email: 'organizer@test.com',
        status: 'open'
      });

      const ts = myLib.apiAddSportToTournament(t.tournament_id, {
        sport_id: 'S001',
        format: 'round_robin',
        points_for_win: 3,
        points_for_draw: 1,
        points_for_loss: 0,
        max_teams: 2
      });

      const t1 = myLib.apiRegisterTeam({
        ts_id: ts.ts_id,
        name: 'Team 1',
        captain_email: 't1@g.com',
        players: [
          { name: 'GK1', email: 't1@g.com', position: 'goalkeeper', gender: 'male', jersey_number: '1' },
          { name: 'P2', email: 'p2@g.com', position: 'forward', gender: 'male', jersey_number: '2' },
          { name: 'P3', email: 'p3@g.com', position: 'midfielder', gender: 'male', jersey_number: '3' },
          { name: 'P4', email: 'p4@g.com', position: 'defender', gender: 'male', jersey_number: '4' },
          { name: 'P5', email: 'p5@g.com', position: 'midfielder', gender: 'male', jersey_number: '5' },
          { name: 'P6', email: 'p6@g.com', position: 'forward', gender: 'male', jersey_number: '6' },
          { name: 'P7', email: 'p7@g.com', position: 'forward', gender: 'male', jersey_number: '7' }
        ]
      });

      const t2 = myLib.apiRegisterTeam({
        ts_id: ts.ts_id,
        name: 'Team 2',
        captain_email: 't2@g.com',
        players: [
          { name: 'GK2', email: 't2@g.com', position: 'goalkeeper', gender: 'male', jersey_number: '1' },
          { name: 'P2', email: 'p22@g.com', position: 'forward', gender: 'male', jersey_number: '2' },
          { name: 'P3', email: 'p32@g.com', position: 'midfielder', gender: 'male', jersey_number: '3' },
          { name: 'P4', email: 'p42@g.com', position: 'defender', gender: 'male', jersey_number: '4' },
          { name: 'P5', email: 'p52@g.com', position: 'midfielder', gender: 'male', jersey_number: '5' },
          { name: 'P6', email: 'p62@g.com', position: 'forward', gender: 'male', jersey_number: '6' },
          { name: 'P7', email: 'p72@g.com', position: 'forward', gender: 'male', jersey_number: '7' }
        ]
      });

      myLib.apiApproveTeam(t1.team_id);
      myLib.apiApproveTeam(t2.team_id);

      myLib.apiGenerateFixtures(ts.ts_id);

      const matchRepo = new myLib.BaseRepository('Match', 'match_id');
      const matches = matchRepo.where('ts_id', ts.ts_id);
      expect(matches.length).toBeGreaterThan(0);

      const m = matches[0];
      const updated = myLib.apiUpdateMatchResult(m.match_id, 3, 1, 'Match completed');
      expect(updated.status).toBe('completed');
      expect(updated.team1_score).toBe(3);
      expect(updated.team2_score).toBe(1);

      // Verify Google Sheets standings were automatically updated via EventBus
      const rankings = myLib.apiGetRankingsByTournamentSport(ts.ts_id);
      expect(rankings.length).toBe(2);
      expect(rankings[0].team_id).toBe(m.team1_id);
      expect(Number(rankings[0].points)).toBe(3);
      expect(Number(rankings[0].goals_for)).toBe(3);
      expect(Number(rankings[0].goals_against)).toBe(1);
    });
  });
});
