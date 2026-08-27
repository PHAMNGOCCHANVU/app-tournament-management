/**
 * EventBus.js - Synchronous In-Memory Event System for Modular Monolith Architecture
 * Decouples match scoring, standings progression, live broadcasting, and archiving.
 */

// Global Event Registry
const EVENT_REGISTRY = {};

/**
 * Register an event listener
 * @param {string} eventName
 * @param {Function} handler
 */
function onEvent(eventName, handler) {
  if (!EVENT_REGISTRY[eventName]) {
    EVENT_REGISTRY[eventName] = [];
  }
  EVENT_REGISTRY[eventName].push(handler);
}

/**
 * Emit an event synchronously to all registered listeners
 * @param {string} eventName
 * @param {Object} payload
 */
function emitEvent(eventName, payload) {
  const handlers = EVENT_REGISTRY[eventName] || [];
  handlers.forEach(handler => {
    try {
      handler(payload);
    } catch (err) {
      if (typeof Logger !== 'undefined' && Logger.log) {
        Logger.log(`[EventBus] Error in listener for "${eventName}": ${err.message}`);
      }
    }
  });
}

/**
 * Clear all event listeners (useful for testing)
 */
function clearEventListeners() {
  Object.keys(EVENT_REGISTRY).forEach(key => delete EVENT_REGISTRY[key]);
}

// Common Event Names
const SYSTEM_EVENTS = {
  MATCH_SCORE_UPDATED: 'MatchScoreUpdatedEvent',
  MATCH_COMPLETED: 'MatchCompletedEvent',
  TOURNAMENT_COMPLETED: 'TournamentCompletedEvent',
  TEAM_APPROVED: 'TeamApprovedEvent'
};
