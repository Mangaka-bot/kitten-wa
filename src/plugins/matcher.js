import { PREFIXES } from './config.js';

export function compile(match, prefixOpt = PREFIXES) {
  if (!Array.isArray(match) || !match.length) return null;

  const strings = match
    .filter(m => typeof m === 'string')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);

  const regexes = match.filter(m => m instanceof RegExp);

  if (!strings.length && !regexes.length) return null;

  const prefixes = prefixOpt === false
    ? null
    : new Set([prefixOpt ?? PREFIXES].flat().map(p => (typeof p === 'string' ? p.trim().toLowerCase() : p)));

  return {
    strings,
    set: strings.length ? new Set(strings) : null,
    regexes,
    prefixes,
    hasPrefix: prefixOpt !== false,
  };
}

export function test(matchers, body) {
  if (!body || typeof body !== 'string') return null;

  const trimmed = body.trim();
  if (!trimmed) return null;
  const text = trimmed.toLowerCase();

  if (matchers.set) {
    if (matchers.prefixes) {
      const prefix = text[0];
      if (matchers.prefixes.has(prefix)) {
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
    } else {
      const idx = text.indexOf(' ');
      const cmd = idx < 0 ? text : text.slice(0, idx);
      if (cmd) {
        if (matchers.set.has(cmd)) {
          return { match: cmd, prefix: null };
        }
        for (const s of matchers.strings) {
          if (cmd.length > s.length && cmd.startsWith(s)) {
            return { match: s, prefix: null };
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