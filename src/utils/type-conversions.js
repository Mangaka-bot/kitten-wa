export const isString = (x) => typeof x === 'string';

export const toNumber = (x) => (x && typeof x.toNumber === 'function' ? x.toNumber() : x);

export const toBase64 = (x) => {
  if (!x) return x;
  if (typeof x === 'string') return x;
  if (Buffer.isBuffer(x)) return x.toString('base64');
  if (x instanceof Uint8Array) return Buffer.from(x.buffer, x.byteOffset, x.byteLength).toString('base64');
  return Buffer.from(x).toString('base64');
};