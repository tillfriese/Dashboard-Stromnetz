export async function register() {
  // DB access and the scheduler only exist in the Node.js server runtime.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startup } = await import("./lib/server/startup");
    await startup();
  }
}
