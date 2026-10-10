import type { Request, Response } from "express";

export function sendValidationError(
  res: Response,
  message: string,
): void {
  res.status(400).json({ error: message });
}

export function sendStorageError(
  req: Request,
  res: Response,
  error: unknown,
): void {
  const diagnostic =
    error instanceof Error
      ? error.message
          .replace(/mongodb(?:\+srv)?:\/\/[^\s"'<>]+/gi, "[MongoDB URI redacted]")
          .slice(0, 300)
      : "Unknown database error";
  req.log.error(
    {
      errorName: error instanceof Error ? error.name : "UnknownError",
      diagnostic,
    },
      "SecureOps storage request failed",
  );
  res.status(503).json({
    error:
      "Persistent storage is unavailable. Check MongoDB Atlas or the local data file, then try again.",
  });
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
