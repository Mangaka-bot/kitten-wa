import { select, input } from "@inquirer/prompts";
import chalk from "chalk";
import { logger } from "#internals.js";

export const getConnectionConfig = async () => {
  try {
    process.stdout.write("\n");
    const type = await select({
      message: "How would you like to connect?",
      choices: [
        {
          name: " ⛶   QR Code",
          value: "qr",
          description: "Generate a secure code to scan"
        },
        {
          name: " 🔑  Phone Number",
          value: "pn",
          description: "Receive a One Time Password"
        }
      ]
    });
    
    if (type === "pn") {
        console.log(chalk.yellow("\n  🔑  Phone Number Selected\n"));
        
        const pn = await input({
          message: "Enter your phone number:",
          validate: (value) => {
              const digitsOnly = /^\d+$/.test(value);
              if (!digitsOnly) return "Digits only (+1 (234) 567-8901 → 12345678901)";
              const correctLength = /^.{7,15}$/.test(value);
              if (!correctLength) return "Phone number length should be from 7 to 15 digits";
              return true;
          },
          transformer: (value) =>  chalk.cyan(value)
      });
      
      return { type, pn }
    } else {
      logger.prompt(chalk.cyan("\n  ⛶  QR Code Selected\n"));
      return { type };
    }
  } catch {
      logger.prompt(chalk.red("\nOperation cancelled"));
      process.exit(0);
  }
};