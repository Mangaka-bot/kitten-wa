import { PREFIXES } from './config.js';

export function compile(match, prefixOpt = PREFIXES) {
  if (!Array.isArray(match) || !match.length) return null;

  const strings = match
    .filter(m => typeof m === 'string')
    .map(s => s.toLowerCase());

  const regexes = match.filter(m => m instanceof RegExp);

  const prefixes = prefixOpt === false
    ? null
    : new Set([prefixOpt ?? PREFIXES].flat());

  return {
    strings,
    set: strings.length ? new Set(strings) : null,
    regexes,
    prefixes,
  };
}

export function test(matchers, body) {
  if (!body || typeof body !== 'string') return null;

  const text = body.toLowerCase();

  if (matchers.set) {
    const prefix = text[0];
    const prefixValid = !matchers.prefixes || matchers.prefixes.has(prefix);

    if (prefixValid) {
      const rest = text.slice(1);
      const idx = rest.indexOf(' ');
      const cmd = idx < 0 ? rest : rest.slice(0, idx);

      if (cmd) {
        if (matchers.set.has(cmd)) {
          return { match: cmd, prefix };
        }

        for (const s of matchers.strings) {
          if (cmd.length > s.length && cmd.startsWith(s)) {
            return { match: s, prefix };
          }
        }
      }
    }
  }

  for (const re of matchers.regexes) {
    re.lastIndex = 0;
    const m = re.exec(body);
    if (m) return { match: m, prefix: null };
  }

  return null;
}