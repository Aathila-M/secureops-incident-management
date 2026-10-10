import {
  Router,
  type IRouter,
  type Request,
  type Response,
} from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { getStorageHealth } from "../lib/storage-mode";

const router: IRouter = Router();

function reportHealth(_req: Request, res: Response): void {
  const health = getStorageHealth();
  const body = HealthCheckResponse.parse(health);
  res.status(health.status === "unavailable" ? 503 : 200).json(body);
}

router.get("/health", reportHealth);
router.get("/healthz", reportHealth);

export default router;
