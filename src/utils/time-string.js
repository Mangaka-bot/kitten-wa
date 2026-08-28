import { getConfig } from '#internals.js';

const { timeZone: defaultTimeZone } = await getConfig();

const formatters = new Map();

function getFormatter(tz) {
  let formatter = formatters.get(tz);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone: tz,
    });
    formatters.set(tz, formatter);
  }
  return formatter;
}

export const getTimeString = (timestamp, timeZone = defaultTimeZone) => {
  if (!timestamp) return ['', ''];
  const date = new Date(timestamp * 1000);
  const formatter = getFormatter(timeZone);
  const result = formatter.format(date);
  return result.split(' at ');
};