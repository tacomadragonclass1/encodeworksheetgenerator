/**
 * Phonics utility — splits a word into grapheme objects for sound-box rendering.
 *
 * Each grapheme object:
 *   { grapheme: string, isVowel: boolean, isDouble: boolean }
 *
 * isDouble  → render as a double-wide box
 * isVowel   → render with off-white (almost-white) background
 *
 * isCVCe flag: when true, the trailing silent 'e' is merged into the
 * preceding consonant box (making it double-wide) rather than getting
 * its own single box, since the silent e has no individual sound.
 */

// Consonant digraphs — two letters, one consonant sound → double box
const CONSONANT_DIGRAPHS = new Set(['ch', 'sh', 'th', 'wh', 'ck', 'ng', 'nk', 'qu']);

// R-controlled vowels — double-wide AND off-white
const R_CONTROLLED = new Set(['ar', 'er', 'ir', 'or', 'ur']);

// Vowel teams / diphthongs — two vowel letters, one vowel sound → double + off-white
const VOWEL_TEAMS = new Set([
  'ai', 'ay', 'ee', 'ea', 'ey',
  'ie', 'igh',
  'oa', 'oe', 'ow', 'oo',
  'ou', 'ow', 'oi', 'oy',
  'au', 'aw',
  'ue', 'ui', 'ew',
]);

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);

/**
 * Returns an ordered array of grapheme objects for the given word.
 */
export function getGraphemes(word, isCVCe = false) {
  const result = [];
  const lower = word.toLowerCase();
  let i = 0;

  while (i < lower.length) {
    // --- try 3-letter combos first (e.g. "igh") ---
    if (i + 2 < lower.length) {
      const tri = lower.slice(i, i + 3);
      if (VOWEL_TEAMS.has(tri)) {
        result.push({ grapheme: word.slice(i, i + 3), isVowel: true, isDouble: true });
        i += 3;
        continue;
      }
    }

    // --- try 2-letter combos ---
    if (i + 1 < lower.length) {
      const pair = lower.slice(i, i + 2);
      if (R_CONTROLLED.has(pair)) {
        result.push({ grapheme: word.slice(i, i + 2), isVowel: true, isDouble: true });
        i += 2;
        continue;
      }
      if (CONSONANT_DIGRAPHS.has(pair)) {
        result.push({ grapheme: word.slice(i, i + 2), isVowel: false, isDouble: true });
        i += 2;
        continue;
      }
      if (VOWEL_TEAMS.has(pair)) {
        result.push({ grapheme: word.slice(i, i + 2), isVowel: true, isDouble: true });
        i += 2;
        continue;
      }
    }

    // --- single character ---
    const ch = lower[i];
    result.push({
      grapheme: word[i],
      isVowel: VOWELS.has(ch),
      isDouble: false,
    });
    i++;
  }

  // CVCe: merge trailing silent 'e' into the preceding consonant box
  if (isCVCe && result.length >= 2) {
    const last = result[result.length - 1];
    if (last.grapheme.toLowerCase() === 'e' && !last.isDouble) {
      result.pop();
      result[result.length - 1].isDouble = true;
      result[result.length - 1].grapheme += last.grapheme; // e.g. 'k' → 'ke'
    }
  }

  return result;
}

/**
 * Returns 'cvc' or 'blends' based on the pattern category.
 */
export function getTemplateType(category) {
  return category === 'CVC' ? 'cvc' : 'blends';
}
