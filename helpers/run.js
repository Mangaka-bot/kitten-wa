export const run = async (promises ) => promises ? (
  (await Promise.allSettled(promises))
    .filter(r => r.status === "rejected")
    .map(r => r.reason)
    .forEach(console.error)
  ) : [];