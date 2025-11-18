const {TIME_ZONE} = globalThis;

export const getTimeString = (timestamp, timeZone = TIME_ZONE) => {
  const date = new Date(timestamp * 1000);
  const options = { 
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone
  };
  const result = date.toLocaleDateString("en-US", options)
  return result.split(" at ")
}