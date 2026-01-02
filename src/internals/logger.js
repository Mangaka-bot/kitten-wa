import pino from "pino";

const logger = pino({
  transport: {
    target: "pino-pretty",
    options: { 
      colorize: true,
      ignore: "pid,hostname",
    }
  }
});

logger.prompt = console.log.bind(console);

export { logger };