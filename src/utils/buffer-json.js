import { BufferJSON } from 'baileys';

export const serialize = (data) => {
  if (data == null) return null;
  try {
    return JSON.stringify(data, BufferJSON.replacer);
  } catch (err) {
    throw new Error(`Serialization failed: ${err.message}`, { cause: err });
  }
}; 

export const deserialize = (json) => {
  if (json == null) return null;
  
  const str = typeof json === 'string' 
    ? json 
    : Buffer.isBuffer(json) 
      ? json.toString('utf8') 
      : String(json);
  
  try {
    return JSON.parse(str, BufferJSON.reviver);
  } catch (err) {
    throw new Error(`Deserialization failed: ${err.message}`, { cause: err });
  }
};