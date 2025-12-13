import { rmSync } from "fs";

export function handleStatus(launchBot, statusCode, spinner) {

  switch (statusCode) {
    case 428: case 515:
      console.clear();
      spinner.text = "Connection closed. reconnecting...";
      break;
    case 408:
      spinner.text = "Connection timed out. reconnecting...";
      break;
    case 503:
      spinner.text = "Service unavailable. reconnecting...";
      break;
    case 401:
      spinner.text = "Session logged out. Recreate session...";
      rmSync("./session", { recursive: true, force: true })
      break;
    case 403:
      spinner.text = "WhatsApp account banned. Recreate session...";
      rmSync("./session", { recursive: true, force: true })
      break;
    case 405:
      spinner.text = "Session not logged in. Recreate session...";
      rmSync("./session", { recursive: true, force: true } );
      break;
    default:
      spinner.text = `Unhandled connection issue. Code: ${statusCode}`;
  }

  launchBot();
}