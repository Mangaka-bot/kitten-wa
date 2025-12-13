export const isString = x => typeof x === "string";
 
export const toNumber = x => (x && typeof x.toNumber === "function") ? x.toNumber() : x;
 
export const toBase64 = x => x ? Buffer.from(x).toString("base64") : x;

export const picRand = arr => arr[Math.floor(Math.random() * arr.length)];

export const chunkArray = (arr, chunkSize) => {
  if (chunkSize <= 0) throw new Error("[chunkArray ERR] Chunk size must be a positive number");
  const result = [];
  for (let i = 0; i < arr.length; i += chunkSize) {
    result.push(arr.slice(i, i + chunkSize));
  }
  return result;
}

export const flattenObj = (obj) => Object.fromEntries(
  Object.entries(obj).flatMap(([key, value]) => 
    value && typeof value === "object" && !Array.isArray(value)&& !(value instanceof Date) ?
    Object.entries(value) : [[key, value]]
))