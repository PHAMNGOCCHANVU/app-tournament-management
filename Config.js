/**
 * Config.js - Central Configuration, Schema Definitions, Enums & Seed Data
 */

// Global Sheet Schema Definition
const SCHEMAS = {
  Tournament: ['tournament_id', 'name', 'description', 'start_date', 'end_date', 'location', 'organizer_email', 'status', 'created_at', 'updated_at'],
  Sport: ['sport_id', 'name', 'type', 'min_players_per_team', 'max_players_per_team', 'scoring_type', 'description', 'categories', 'positions', 'position_rules', 'has_skill_level', 'default_levels'],
  TournamentSport: ['ts_id', 'tournament_id', 'sport_id', 'format', 'max_teams', 'min_teams', 'points_for_win', 'points_for_draw', 'points_for_loss', 'num_groups', 'teams_advance_per_group', 'registration_deadline', 'status', 'category', 'skill_level'],
  Team: ['team_id', 'ts_id', 'name', 'captain_email', 'registration_date', 'status', 'group_name', 'seed'],
  Player: ['player_id', 'team_id', 'name', 'email', 'phone', 'jersey_number', 'role_in_team', 'gender', 'position'],
  Match: ['match_id', 'ts_id', 'round', 'round_name', 'group_name', 'team1_id', 'team2_id', 'team1_score', 'team2_score', 'winner_team_id', 'match_date', 'location', 'status', 'notes', 'updated_by', 'updated_at'],
  Ranking: ['ranking_id', 'ts_id', 'team_id', 'group_name', 'played', 'won', 'drawn', 'lost', 'goals_for', 'goals_against', 'goal_difference', 'points', 'rank'],
  User: ['user_id', 'email', 'display_name', 'created_at'],
  TournamentRole: ['role_id', 'tournament_id', 'user_email', 'role', 'assigned_at', 'assigned_by'],
  SportScore: ['match_id', 'sport_type', 'set1_a', 'set1_b', 'set2_a', 'set2_b', 'set3_a', 'set3_b', 'extra_data', 'updated_at']
};

// Tournament Lifecycle Statuses
const TOURNAMENT_STATUS = {
  DRAFT: 'draft',
  OPEN: 'open',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  ARCHIVED: 'archived'
};

// Match Lifecycle Statuses
const MATCH_STATUS = {
  SCHEDULED: 'scheduled',
  ONGOING: 'ongoing',
  WAITING_CONFIRMATION: 'waiting_confirmation',
  COMPLETED: 'completed',
  POSTPONED: 'postponed',
  CANCELLED: 'cancelled'
};

// Team Registration Statuses
const TEAM_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  WITHDRAWN: 'withdrawn'
};

// Sport Types & Scoring
const SPORT_TYPE = {
  FOOTBALL: 'FOOTBALL',
  PICKLEBALL: 'PICKLEBALL',
  BADMINTON: 'BADMINTON',
  VOLLEYBALL: 'VOLLEYBALL',
  TABLE_TENNIS: 'TABLE_TENNIS'
};

// Firebase Configuration defaults (Fallback if Script Properties are not set)
const FIREBASE_CONFIG = {
  DATABASE_URL: '', // e.g. "https://your-project-id-default-rtdb.firebaseio.com"
  SECRET: '',
  ENABLED: false
};

/**
 * Get Firebase Realtime Database Configuration from Google Apps Script Properties
 */
function getFirebaseConfig() {
  let dbUrl = '';
  let secret = '';
  try {
    if (typeof PropertiesService !== 'undefined' && PropertiesService.getScriptProperties) {
      const props = PropertiesService.getScriptProperties();
      dbUrl = props.getProperty('FIREBASE_URL') || '';
      secret = props.getProperty('FIREBASE_SECRET') || '';
    }
  } catch (e) {
    // Ignore in local environments without PropertiesService
  }

  // Fallback to static constant if not set in ScriptProperties
  if (!dbUrl && typeof FIREBASE_CONFIG !== 'undefined' && FIREBASE_CONFIG.DATABASE_URL) {
    dbUrl = FIREBASE_CONFIG.DATABASE_URL;
  }
  if (!secret && typeof FIREBASE_CONFIG !== 'undefined' && FIREBASE_CONFIG.SECRET) {
    secret = FIREBASE_CONFIG.SECRET;
  }

  // Normalize URL (remove trailing slashes)
  if (dbUrl) {
    dbUrl = String(dbUrl).trim().replace(/\/+$/, '');
  }
  if (secret) {
    secret = String(secret).trim();
  }

  return {
    DATABASE_URL: dbUrl,
    SECRET: secret,
    ENABLED: !!dbUrl
  };
}

/**
 * Expose safe public Firebase config for client browser (without secret)
 */
function apiGetFirebasePublicConfig() {
  const fb = getFirebaseConfig();
  return {
    databaseUrl: fb.DATABASE_URL,
    enabled: fb.ENABLED
  };
}

// Global In-Memory Cache Store for current execution context
const CACHE_STORE = {};

// Default Seed Sports
const SEED_SPORTS = [
  {
    sport_id: 'S001',
    name: 'Bóng đá 7 người',
    type: 'team',
    min_players_per_team: 7,
    max_players_per_team: 15,
    scoring_type: 'goals',
    description: 'Môn bóng đá 7 người',
    categories: JSON.stringify(['open', 'mens', 'womens']),
    positions: JSON.stringify(['goalkeeper', 'defender', 'midfielder', 'forward']),
    position_rules: JSON.stringify({ goalkeeper: { min: 1 } }),
    has_skill_level: false,
    default_levels: JSON.stringify([])
  },
  {
    sport_id: 'S002',
    name: 'Bóng chuyền',
    type: 'team',
    min_players_per_team: 6,
    max_players_per_team: 12,
    scoring_type: 'sets',
    description: 'Bóng chuyền nam/nữ',
    categories: JSON.stringify(['mens', 'womens', 'mixed']),
    positions: JSON.stringify(['setter', 'middle_blocker', 'outside_hitter', 'opposite_hitter', 'libero']),
    position_rules: JSON.stringify({}),
    has_skill_level: false,
    default_levels: JSON.stringify([])
  },
  {
    sport_id: 'S003',
    name: 'Cầu lông đơn',
    type: 'individual',
    min_players_per_team: 1,
    max_players_per_team: 1,
    scoring_type: 'sets',
    description: 'Cầu lông thi đấu đơn',
    categories: JSON.stringify(['mens_singles', 'womens_singles']),
    positions: JSON.stringify([]),
    position_rules: JSON.stringify({}),
    has_skill_level: true,
    default_levels: JSON.stringify(['A', 'B', 'C'])
  },
  {
    sport_id: 'S004',
    name: 'Cầu lông đôi',
    type: 'doubles',
    min_players_per_team: 2,
    max_players_per_team: 2,
    scoring_type: 'sets',
    description: 'Cầu lông thi đấu đôi',
    categories: JSON.stringify(['mens_doubles', 'womens_doubles', 'mixed_doubles']),
    positions: JSON.stringify([]),
    position_rules: JSON.stringify({}),
    has_skill_level: true,
    default_levels: JSON.stringify(['A', 'B', 'C'])
  },
  {
    sport_id: 'S005',
    name: 'Pickleball đôi',
    type: 'doubles',
    min_players_per_team: 2,
    max_players_per_team: 2,
    scoring_type: 'points',
    description: 'Pickleball thi đấu đôi',
    categories: JSON.stringify(['mens_doubles', 'womens_doubles', 'mixed_doubles']),
    positions: JSON.stringify([]),
    position_rules: JSON.stringify({}),
    has_skill_level: true,
    default_levels: JSON.stringify(['A', 'B', 'C'])
  },
  {
    sport_id: 'S006',
    name: 'Bóng bàn đơn',
    type: 'individual',
    min_players_per_team: 1,
    max_players_per_team: 1,
    scoring_type: 'sets',
    description: 'Bóng bàn thi đấu đơn',
    categories: JSON.stringify(['mens_singles', 'womens_singles']),
    positions: JSON.stringify([]),
    position_rules: JSON.stringify({}),
    has_skill_level: true,
    default_levels: JSON.stringify(['A', 'B', 'C'])
  }
];
