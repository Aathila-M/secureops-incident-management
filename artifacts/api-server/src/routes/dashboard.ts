import { Router, type IRouter } from "express";
import {
  GetDashboardSummaryResponse,
  type Severity,
} from "@workspace/api-zod";
import {
  getIncidentCollection,
  getVulnerabilityCollection,
} from "../lib/mongo";
import { getLocalDashboardSummary } from "../lib/local-json";
import { withActiveStorage } from "../lib/storage-mode";
import { sendStorageError } from "../lib/route-errors";

const router: IRouter = Router();
const severities: Severity[] = ["Critical", "High", "Medium", "Low"];

interface GroupedCount {
  _id: Severity;
  count: number;
}

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  try {
    const summary = await withActiveStorage(async () => {
      const [incidents, vulnerabilities] = await Promise.all([
        getIncidentCollection(),
        getVulnerabilityCollection(),
      ]);

      const [
        totalIncidents,
        openIncidents,
        criticalIncidents,
        totalVulnerabilities,
        openVulnerabilities,
        incidentGroups,
        vulnerabilityGroups,
      ] = await Promise.all([
        incidents.countDocuments(),
        incidents.countDocuments({
          status: { $in: ["Open", "Investigating", "Contained"] },
        }),
        incidents.countDocuments({ severity: "Critical" }),
        vulnerabilities.countDocuments(),
        vulnerabilities.countDocuments({ status: { $in: ["Open", "In Progress"] } }),
        incidents
          .aggregate<GroupedCount>([
            { $group: { _id: "$severity", count: { $sum: 1 } } },
          ])
          .toArray(),
        vulnerabilities
          .aggregate<GroupedCount>([
            { $group: { _id: "$severity", count: { $sum: 1 } } },
          ])
          .toArray(),
      ]);
      const incidentCounts = new Map(
        incidentGroups.map((group) => [group._id, group.count]),
      );
      const vulnerabilityCounts = new Map(
        vulnerabilityGroups.map((group) => [group._id, group.count]),
      );
      return {
        totalIncidents,
        openIncidents,
        criticalIncidents,
        totalVulnerabilities,
        openVulnerabilities,
        incidentsBySeverity: severities.map((severity) => ({
          severity,
          count: incidentCounts.get(severity) ?? 0,
        })),
        vulnerabilitiesBySeverity: severities.map((severity) => ({
          severity,
          count: vulnerabilityCounts.get(severity) ?? 0,
        })),
      };
    }, getLocalDashboardSummary);

    res.json(GetDashboardSummaryResponse.parse(summary));
  } catch (error) {
    sendStorageError(req, res, error);
  }
});

export default router;
