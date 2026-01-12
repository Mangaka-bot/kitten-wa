import { formatMessage } from './format-message.js';

export const formatter = (wa, event, eventName) => {
  eventName ??= 'messages.upsert';
  
  switch (eventName) {
    case 'messages.upsert':
      return {
        ...formatMessage(wa, event),
        event: eventName
      };
    default: return event;
  }
}