export const isString = x => typeof x === "string";
 
export const toNumber = x => (x && typeof x.toNumber === "function") ? x.toNumber() : x;
 
export const toBase64 = x => x ? Buffer.from(x).toString("base64") : x;

export const picRand = arr => arr[Math.floor(Math.random() * arr.length)];