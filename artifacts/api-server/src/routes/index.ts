import { Router, type IRouter } from "express";
import healthRouter from "./health";
import dashboardRouter from "./dashboard";
import incidentsRouter from "./incidents";
import vulnerabilitiesRouter from "./vulnerabilities";

const router: IRouter = Router();

router.use(healthRouter);
router.use(dashboardRouter);
router.use(incidentsRouter);
router.use(vulnerabilitiesRouter);

export default router;
