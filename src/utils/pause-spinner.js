import { spinner } from "#internals.js";

export const pauseSpinner = async (action) => {
  if (!spinner.isSpinning) return action();

  spinner.stop();
  try {
    return await action();
  } finally {
    spinner.start();
  }
};