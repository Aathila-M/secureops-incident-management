import { Router, type IRouter } from "express";
import { ObjectId, type Filter } from "mongodb";
import {
  CreateVulnerabilityBody,
  CreateVulnerabilityResponse,
  DeleteVulnerabilityParams,
  DeleteVulnerabilityResponse,
  GetVulnerabilityParams,
  GetVulnerabilityResponse,
  ListVulnerabilitiesQueryParams,
  ListVulnerabilitiesResponse,
  UpdateVulnerabilityBody,
  UpdateVulnerabilityParams,
  UpdateVulnerabilityResponse,
  type Severity,
} from "@workspace/api-zod";
import {
  getVulnerabilityCollection,
  type VulnerabilityDocument,
} from "../lib/mongo";
import {
  createLocalVulnerability,
  deleteLocalVulnerability,
  getLocalVulnerability,
  listLocalVulnerabilities,
  updateLocalVulnerability,
  type VulnerabilityRecord,
} from "../lib/local-json";
import {
  mirrorVulnerability,
  removeMirroredVulnerability,
  withActiveStorage,
} from "../lib/storage-mode";
import {
  escapeRegex,
  sendStorageError,
  sendValidationError,
} from "../lib/route-errors";

const router: IRouter = Router();

function toVulnerability(
  document: VulnerabilityDocument,
): VulnerabilityRecord {
  return {
    id: document._id.toHexString(),
    title: document.title,
    affectedAsset: document.affectedAsset,
    description: document.description,
    severity: document.severity,
    status: document.status,
    cveId: document.cveId,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  };
}

router.get("/vulnerabilities", async (req, res): Promise<void> => {
  const parsedQuery = ListVulnerabilitiesQueryParams.safeParse(req.query);
  if (!parsedQuery.success) {
    sendValidationError(res, parsedQuery.error.issues[0]?.message ?? "Invalid filters.");
    return;
  }

  try {
    const { search, severity, status } = parsedQuery.data;
    const records = await withActiveStorage(
      async () => {
        const collection = await getVulnerabilityCollection();
        const filter: Filter<VulnerabilityDocument> = {};
        if (severity) filter.severity = severity as Severity;
        if (status) filter.status = status;

        const term = search?.trim();
        if (term) {
          const pattern = { $regex: escapeRegex(term), $options: "i" };
          filter.$or = [
            { title: pattern },
            { description: pattern },
            { affectedAsset: pattern },
            { cveId: pattern },
          ];
        }
        const documents = await collection
          .find(filter)
          .sort({ updatedAt: -1 })
          .limit(500)
          .toArray();
        return documents.map(toVulnerability);
      },
      () => listLocalVulnerabilities({ search, severity, status }),
    );
    res.json(ListVulnerabilitiesResponse.parse(records));
  } catch (error) {
    sendStorageError(req, res, error);
  }
});

router.post("/vulnerabilities", async (req, res): Promise<void> => {
  const parsedBody = CreateVulnerabilityBody.safeParse(req.body);
  if (!parsedBody.success) {
    sendValidationError(res, parsedBody.error.issues[0]?.message ?? "Invalid vulnerability.");
    return;
  }

  try {
    const input = parsedBody.data;
    const id = new ObjectId();
    const now = new Date();
    const document: VulnerabilityDocument = {
      _id: id,
      title: input.title.trim(),
      affectedAsset: input.affectedAsset.trim(),
      description: input.description.trim(),
      severity: input.severity,
      status: input.status ?? "Open",
      cveId: input.cveId?.trim() || null,
      createdAt: now,
      updatedAt: now,
    };
    const record = await withActiveStorage(
      async () => {
        await (await getVulnerabilityCollection()).insertOne(document);
        return toVulnerability(document);
      },
      () =>
        createLocalVulnerability(
          input,
          id.toHexString(),
          now.toISOString(),
        ),
    );
    await mirrorVulnerability(record);
    res.status(201).json(CreateVulnerabilityResponse.parse(record));
  } catch (error) {
    sendStorageError(req, res, error);
  }
});

router.get(
  "/vulnerabilities/:vulnerabilityId",
  async (req, res): Promise<void> => {
    const parsedParams = GetVulnerabilityParams.safeParse(req.params);
    if (
      !parsedParams.success ||
      !ObjectId.isValid(parsedParams.data.vulnerabilityId)
    ) {
      sendValidationError(res, "A valid vulnerability ID is required.");
      return;
    }

    try {
      const { vulnerabilityId } = parsedParams.data;
      const record = await withActiveStorage(
        async () => {
          const document = await (
            await getVulnerabilityCollection()
          ).findOne({ _id: new ObjectId(vulnerabilityId) });
          return document ? toVulnerability(document) : null;
        },
        () => getLocalVulnerability(vulnerabilityId),
      );
      if (!record) {
        res.status(404).json({ error: "Vulnerability not found." });
        return;
      }
      res.json(GetVulnerabilityResponse.parse(record));
    } catch (error) {
      sendStorageError(req, res, error);
    }
  },
);

router.patch(
  "/vulnerabilities/:vulnerabilityId",
  async (req, res): Promise<void> => {
    const parsedParams = UpdateVulnerabilityParams.safeParse(req.params);
    if (
      !parsedParams.success ||
      !ObjectId.isValid(parsedParams.data.vulnerabilityId)
    ) {
      sendValidationError(res, "A valid vulnerability ID is required.");
      return;
    }
    const parsedBody = UpdateVulnerabilityBody.safeParse(req.body);
    if (!parsedBody.success) {
      sendValidationError(
        res,
        parsedBody.error.issues[0]?.message ?? "Invalid vulnerability.",
      );
      return;
    }
    const changes = Object.fromEntries(
      Object.entries(parsedBody.data)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => {
          if (typeof value !== "string") return [key, value];
          const trimmed = value.trim();
          if (key === "cveId" && !trimmed) return [key, null];
          return [key, trimmed];
        }),
    ) as Partial<Omit<VulnerabilityRecord, "id" | "createdAt" | "updatedAt">>;
    if (Object.keys(changes).length === 0) {
      sendValidationError(res, "Provide at least one field to update.");
      return;
    }

    try {
      const { vulnerabilityId } = parsedParams.data;
      const updatedAt = new Date();
      const record = await withActiveStorage(
        async () => {
          const document = await (
            await getVulnerabilityCollection()
          ).findOneAndUpdate(
            { _id: new ObjectId(vulnerabilityId) },
            { $set: { ...changes, updatedAt } },
            { returnDocument: "after" },
          );
          return document ? toVulnerability(document) : null;
        },
        () =>
          updateLocalVulnerability(
            vulnerabilityId,
            changes,
            updatedAt.toISOString(),
          ),
      );
      if (!record) {
        res.status(404).json({ error: "Vulnerability not found." });
        return;
      }
      await mirrorVulnerability(record);
      res.json(UpdateVulnerabilityResponse.parse(record));
    } catch (error) {
      sendStorageError(req, res, error);
    }
  },
);

router.delete(
  "/vulnerabilities/:vulnerabilityId",
  async (req, res): Promise<void> => {
    const parsedParams = DeleteVulnerabilityParams.safeParse(req.params);
    if (
      !parsedParams.success ||
      !ObjectId.isValid(parsedParams.data.vulnerabilityId)
    ) {
      sendValidationError(res, "A valid vulnerability ID is required.");
      return;
    }

    try {
      const { vulnerabilityId } = parsedParams.data;
      const deleted = await withActiveStorage(
        async () =>
          (
            await getVulnerabilityCollection()
          )
            .deleteOne({ _id: new ObjectId(vulnerabilityId) })
            .then((result) => result.deletedCount > 0),
        () => deleteLocalVulnerability(vulnerabilityId, true),
      );
      if (!deleted) {
        res.status(404).json({ error: "Vulnerability not found." });
        return;
      }
      await removeMirroredVulnerability(vulnerabilityId);
      res.json(DeleteVulnerabilityResponse.parse({ deleted: true }));
    } catch (error) {
      sendStorageError(req, res, error);
    }
  },
);

export default router;
