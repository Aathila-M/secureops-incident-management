import app from "./app";
import { logger } from "./lib/logger";
import { initializeStorage } from "./lib/storage-mode";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function startServer(): Promise<void> {
  await initializeStorage();

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
  });
}

void startServer().catch((error: unknown) => {
  logger.fatal(
    { errorName: error instanceof Error ? error.name : "UnknownError" },
    "Unable to initialize SecureOps storage",
  );
  process.exit(1);
});
