/**
 * Duration parsing/formatting for mute, giveaway and slowmode commands.
 * Supports units s/m/h/d/w and combinations like "1h30m". Default unit is
 * minutes when a bare number is given. Discord timeouts cap at 28 days.
 */

const MAX_MS = 28 * 24 * 60 * 60 * 1000;

const UNIT_MS = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 };

/**
 * Parses strings like "90s", "1h30m", "2d", "1w", "15". Returns milliseconds
 * or null when the input is invalid. Never throws.
 */
function parseDuration(input) {
    if (!input) return null;
    const str = String(input).trim().toLowerCase();
    if (!str) return null;

    const parts = str.matchAll(/(\d+)\s*([smhdw])/g);
    let total = 0;
    let matched = false;
    for (const match of parts) {
        total += parseInt(match[1], 10) * UNIT_MS[match[2]];
        matched = true;
    }
    if (!matched) {
        const bare = parseInt(str, 10);
        if (!Number.isInteger(bare) || bare <= 0) return null;
        total = bare * UNIT_MS.m;
    }
    if (!Number.isFinite(total) || total <= 0) return null;
    return Math.min(total, MAX_MS);
}

/**
 * Formats a millisecond value into a human readable English duration.
 * e.g. "1 hour 30 minutes".
 */
function formatDuration(ms) {
    if (!Number.isFinite(ms) || ms <= 0) return 'immediately';

    const units = [
        { ms: UNIT_MS.d, unit: 'day', unitSingular: 'day' },
        { ms: UNIT_MS.h, unit: 'hour', unitSingular: 'hour' },
        { ms: UNIT_MS.m, unit: 'minute', unitSingular: 'minute' },
        { ms: UNIT_MS.s, unit: 'second', unitSingular: 'second' },
    ];
    const parts = [];
    let remaining = ms;
    for (const unit of units) {
        const count = Math.floor(remaining / unit.ms);
        if (count > 0) {
            parts.push(`${count} ${count === 1 ? unit.unitSingular : unit.unit}`);
            remaining -= count * unit.ms;
        }
    }
    return parts.join(' ');
}

module.exports = { parseDuration, formatDuration, MAX_MS };