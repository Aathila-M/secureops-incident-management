import { Router, type IRouter } from "express";
import { ObjectId, type Filter } from "mongodb";
import {
  CreateIncidentBody,
  CreateIncidentResponse,
  DeleteIncidentParams,
  DeleteIncidentResponse,
  GetIncidentParams,
  GetIncidentResponse,
  ListIncidentsQueryParams,
  ListIncidentsResponse,
  UpdateIncidentBody,
  UpdateIncidentParams,
  UpdateIncidentResponse,
  type Severity,
} from "@workspace/api-zod";
import {
  getIncidentCollection,
  type IncidentDocument,
} from "../lib/mongo";
import {
  createLocalIncident,
  deleteLocalIncident,
  getLocalIncident,
  listLocalIncidents,
  updateLocalIncident,
  type IncidentRecord,
} from "../lib/local-json";
import {
  mirrorIncident,
  removeMirroredIncident,
  withActiveStorage,
} from "../lib/storage-mode";
import {
  escapeRegex,
  sendStorageError,
  sendValidationError,
} from "../lib/route-errors";

const router: IRouter = Router();

function isObjectId(id: string): boolean {
  return ObjectId.isValid(id);
}

function toIncident(document: IncidentDocument): IncidentRecord {
  return {
    id: document._id.toHexString(),
    title: document.title,
    description: document.description,
    severity: document.severity,
    status: document.status,
    affectedAsset: document.affectedAsset,
    assignee: document.assignee,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  };
}

router.get("/incidents", async (req, res): Promise<void> => {
  const parsedQuery = ListIncidentsQueryParams.safeParse(req.query);
  if (!parsedQuery.success) {
    sendValidationError(res, parsedQuery.error.issues[0]?.message ?? "Invalid filters.");
    return;
  }

  try {
    const { search, severity, status } = parsedQuery.data;
    const records = await withActiveStorage(
      async () => {
        const collection = await getIncidentCollection();
        const filter: Filter<IncidentDocument> = {};
        if (severity) filter.severity = severity as Severity;
        if (status) filter.status = status;

        const term = search?.trim();
        if (term) {
          const pattern = { $regex: escapeRegex(term), $options: "i" };
          filter.$or = [
            { title: pattern },
            { description: pattern },
            { affectedAsset: pattern },
            { assignee: pattern },
          ];
        }
        const documents = await collection
          .find(filter)
          .sort({ updatedAt: -1 })
          .limit(500)
          .toArray();
        return documents.map(toIncident);
      },
      () => listLocalIncidents({ search, severity, status }),
    );
    res.json(ListIncidentsResponse.parse(records));
  } catch (error) {
    sendStorageError(req, res, error);
  }
});

router.post("/incidents", async (req, res): Promise<void> => {
  const parsedBody = CreateIncidentBody.safeParse(req.body);
  if (!parsedBody.success) {
    sendValidationError(res, parsedBody.error.issues[0]?.message ?? "Invalid incident.");
    return;
  }

  try {
    const input = parsedBody.data;
    const id = new ObjectId();
    const now = new Date();
    const document: IncidentDocument = {
      _id: id,
      title: input.title.trim(),
      description: input.description.trim(),
      severity: input.severity,
      status: input.status ?? "Open",
      affectedAsset: input.affectedAsset?.trim() || null,
      assignee: input.assignee?.trim() || null,
      createdAt: now,
      updatedAt: now,
    };
    const record = await withActiveStorage(
      async () => {
        await (await getIncidentCollection()).insertOne(document);
        return toIncident(document);
      },
      () =>
        createLocalIncident(
          input,
          id.toHexString(),
          now.toISOString(),
        ),
    );
    await mirrorIncident(record);
    res.status(201).json(CreateIncidentResponse.parse(record));
  } catch (error) {
    sendStorageError(req, res, error);
  }
});

router.get("/incidents/:incidentId", async (req, res): Promise<void> => {
  const parsedParams = GetIncidentParams.safeParse(req.params);
  if (!parsedParams.success || !isObjectId(parsedParams.data.incidentId)) {
    sendValidationError(res, "A valid incident ID is required.");
    return;
  }

  try {
    const { incidentId } = parsedParams.data;
    const record = await withActiveStorage(
      async () => {
        const document = await (await getIncidentCollection()).findOne({
          _id: new ObjectId(incidentId),
        });
        return document ? toIncident(document) : null;
      },
      () => getLocalIncident(incidentId),
    );
    if (!record) {
      res.status(404).json({ error: "Incident not found." });
      return;
    }
    res.json(GetIncidentResponse.parse(record));
  } catch (error) {
    sendStorageError(req, res, error);
  }
});

router.patch("/incidents/:incidentId", async (req, res): Promise<void> => {
  const parsedParams = UpdateIncidentParams.safeParse(req.params);
  if (!parsedParams.success || !isObjectId(parsedParams.data.incidentId)) {
    sendValidationError(res, "A valid incident ID is required.");
    return;
  }
  const parsedBody = UpdateIncidentBody.safeParse(req.body);
  if (!parsedBody.success) {
    sendValidationError(res, parsedBody.error.issues[0]?.message ?? "Invalid incident.");
    return;
  }
  const changes = Object.fromEntries(
    Object.entries(parsedBody.data)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => {
        if (typeof value !== "string") return [key, value];
        const trimmed = value.trim();
        if ((key === "affectedAsset" || key === "assignee") && !trimmed) {
          return [key, null];
        }
        return [key, trimmed];
      }),
  ) as Partial<Omit<IncidentRecord, "id" | "createdAt" | "updatedAt">>;
  if (Object.keys(changes).length === 0) {
    sendValidationError(res, "Provide at least one field to update.");
    return;
  }

  try {
    const { incidentId } = parsedParams.data;
    const updatedAt = new Date();
    const record = await withActiveStorage(
      async () => {
        const document = await (
          await getIncidentCollection()
        ).findOneAndUpdate(
          { _id: new ObjectId(incidentId) },
          { $set: { ...changes, updatedAt } },
          { returnDocument: "after" },
        );
        return document ? toIncident(document) : null;
      },
      () => updateLocalIncident(incidentId, changes, updatedAt.toISOString()),
    );
    if (!record) {
      res.status(404).json({ error: "Incident not found." });
      return;
    }
    await mirrorIncident(record);
    res.json(UpdateIncidentResponse.parse(record));
  } catch (error) {
    sendStorageError(req, res, error);
  }
});

router.delete("/incidents/:incidentId", async (req, res): Promise<void> => {
  const parsedParams = DeleteIncidentParams.safeParse(req.params);
  if (!parsedParams.success || !isObjectId(parsedParams.data.incidentId)) {
    sendValidationError(res, "A valid incident ID is required.");
    return;
  }

  try {
    const { incidentId } = parsedParams.data;
    const deleted = await withActiveStorage(
      async () =>
        (
          await getIncidentCollection()
        ).deleteOne({ _id: new ObjectId(incidentId) }).then((result) => result.deletedCount > 0),
      () => deleteLocalIncident(incidentId, true),
    );
    if (!deleted) {
      res.status(404).json({ error: "Incident not found." });
      return;
    }
    await removeMirroredIncident(incidentId);
    res.json(DeleteIncidentResponse.parse({ deleted: true }));
  } catch (error) {
    sendStorageError(req, res, error);
  }
});

export default router;
