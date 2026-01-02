import { BufferJSON } from 'baileys';

export const serialize = (data) => {
  if (data == null) return null;
  return JSON.stringify(data, BufferJSON.replacer);
} 

export const deserialize = (json) => {
  if (json == null) return null;
  return JSON.parse(json, BufferJSON.reviver);
};