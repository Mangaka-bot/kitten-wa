import { getConfig } from '#internals.js';

const { timeZone } = await getConfig();

export const getTimeString = (timestamp, TIME_ZONE = timeZone) => {
  const date = new Date(timestamp * 1000);
  const options = { 
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    TIME_ZONE
  };
  const result = date.toLocaleDateString('en-US', options)
  return result.split(' at ')
}