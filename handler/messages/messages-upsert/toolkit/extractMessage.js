import { getContentType } from "baileys"

export const extractMessage = (message) => {
  let type = getContentType(message);
  let data = message?.[type];

  // cases like viewonce or document messages etc
  if (data?.message) {
    const innerType = getContentType(data.message);
    if (innerType) {
      type = innerType;
      data = data.message[type];
    }
  }
  return  [type, data];
};