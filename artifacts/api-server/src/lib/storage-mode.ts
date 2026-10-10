import { ObjectId } from "mongodb";
import {
  deleteLocalIncident,
  deleteLocalVulnerability,
  getLocalSnapshot,
  initializeLocalJson,
  replaceLocalSnapshot,
  upsertLocalIncident,
  upsertLocalVulnerability,
  type IncidentRecord,
  type VulnerabilityRecord,
} from "./local-json";
import {
  getDatabase,
  getIncidentCollection,
  getVulnerabilityCollection,
  type IncidentDocument,
  type VulnerabilityDocument,
} from "./mongo";
import { logger } from "./logger";

export type StorageMode = "mongodb" | "local-json" | "unavailable";

export interface StorageHealth {
  status: "ok" | "degraded" | "unavailable";
  storageMode: StorageMode;
  mongodbConfigured: boolean;
  mongodbConnected: boolean;
  localFallbackActive: boolean;
  message: string;
}

let storageMode: StorageMode = "unavailable";
let mongodbConnected = false;
let localJsonReady = false;
let lastDiagnostic = "Storage initialization has not completed.";

function sanitizedDiagnostic(error: unknown): string {
  if (!(error instanceof Error)) return "Unknown storage error";
  const message = error.message
    .replace(/mongodb(?:\+srv)?:\/\/[^\s"'<>]+/gi, "[MongoDB URI redacted]")
    .slice(0, 300);
  if (/tlsv1 alert internal error|ssl3_read_bytes/i.test(message)) {
    return "MongoDB TLS handshake failed; check the Atlas driver URI, cluster status, and network access.";
  }
  if (error.name === "MongoServerSelectionError") {
    return "MongoDB could not select a server; check Atlas status, TLS settings, and network access.";
  }
  return message;
}

function toIncidentRecord(document: IncidentDocument): IncidentRecord {
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

function toVulnerabilityRecord(
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

async function mergeLocalRecordsIntoMongo(): Promise<void> {
  const local = await getLocalSnapshot();
  const [incidents, vulnerabilities] = await Promise.all([
    getIncidentCollection(),
    getVulnerabilityCollection(),
  ]);

  for (const id of local.deletedIncidentIds) {
    if (ObjectId.isValid(id)) {
      await incidents.deleteOne({ _id: new ObjectId(id) });
    }
  }
  for (const id of local.deletedVulnerabilityIds) {
    if (ObjectId.isValid(id)) {
      await vulnerabilities.deleteOne({ _id: new ObjectId(id) });
    }
  }

  for (const record of local.incidents) {
    const document: IncidentDocument = {
      _id: new ObjectId(record.id),
      title: record.title,
      description: record.description,
      severity: record.severity,
      status: record.status,
      affectedAsset: record.affectedAsset,
      assignee: record.assignee,
      createdAt: new Date(record.createdAt),
      updatedAt: new Date(record.updatedAt),
    };
    const existing = await incidents.findOne({ _id: document._id });
    if (
      !existing ||
      document.updatedAt.getTime() >= existing.updatedAt.getTime()
    ) {
      await incidents.replaceOne(
        { _id: document._id },
        document,
        { upsert: true },
      );
    }
  }

  for (const record of local.vulnerabilities) {
    const document: VulnerabilityDocument = {
      _id: new ObjectId(record.id),
      title: record.title,
      affectedAsset: record.affectedAsset,
      description: record.description,
      severity: record.severity,
      status: record.status,
      cveId: record.cveId,
      createdAt: new Date(record.createdAt),
      updatedAt: new Date(record.updatedAt),
    };
    const existing = await vulnerabilities.findOne({ _id: document._id });
    if (
      !existing ||
      document.updatedAt.getTime() >= existing.updatedAt.getTime()
    ) {
      await vulnerabilities.replaceOne(
        { _id: document._id },
        document,
        { upsert: true },
      );
    }
  }

  const [incidentDocs, vulnerabilityDocs] = await Promise.all([
    incidents.find({}).toArray(),
    vulnerabilities.find({}).toArray(),
  ]);
  await replaceLocalSnapshot({
    incidents: incidentDocs.map(toIncidentRecord),
    vulnerabilities: vulnerabilityDocs.map(toVulnerabilityRecord),
  });
}

export async function initializeStorage(): Promise<void> {
  try {
    await initializeLocalJson();
    localJsonReady = true;
  } catch (error) {
    localJsonReady = false;
    lastDiagnostic = `Local JSON storage could not be initialized: ${sanitizedDiagnostic(error)}`;
    logger.error(
      { errorName: error instanceof Error ? error.name : "UnknownError" },
      "Local JSON storage initialization failed",
    );
  }

  const mongodbConfigured = Boolean(process.env.MONGODB_URI);
  if (!mongodbConfigured) {
    storageMode = localJsonReady ? "local-json" : "unavailable";
    lastDiagnostic = localJsonReady
      ? "MONGODB_URI is not configured; using persistent local JSON storage."
      : lastDiagnostic;
    logger.info({ storageMode }, "SecureOps storage initialized");
    return;
  }

  try {
    const database = await getDatabase();
    await database.command({ ping: 1 });
    if (localJsonReady) await mergeLocalRecordsIntoMongo();
    storageMode = "mongodb";
    mongodbConnected = true;
    lastDiagnostic = "";
    logger.info({ storageMode }, "SecureOps storage initialized");
  } catch (error) {
    mongodbConnected = false;
    storageMode = localJsonReady ? "local-json" : "unavailable";
    lastDiagnostic = sanitizedDiagnostic(error);
    logger.warn(
      {
        storageMode,
        errorName: error instanceof Error ? error.name : "UnknownError",
        diagnostic: lastDiagnostic,
      },
      "MongoDB unavailable; selecting persistent local storage",
    );
  }
}

export function getStorageHealth(): StorageHealth {
  const mongodbConfigured = Boolean(process.env.MONGODB_URI);
  if (storageMode === "mongodb") {
    return {
      status: "ok",
      storageMode,
      mongodbConfigured,
      mongodbConnected,
      localFallbackActive: false,
      message: "MongoDB is connected and serving application data.",
    };
  }
  if (storageMode === "local-json") {
    return {
      status: "degraded",
      storageMode,
      mongodbConfigured,
      mongodbConnected: false,
      localFallbackActive: true,
      message: `Persistent local JSON storage is active. ${lastDiagnostic}`,
    };
  }
  return {
    status: "unavailable",
    storageMode,
    mongodbConfigured,
    mongodbConnected: false,
    localFallbackActive: false,
    message: `No writable storage is available. ${lastDiagnostic}`,
  };
}

function isMongoUnavailable(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (
    error.name === "MongoServerSelectionError" ||
    error.name === "MongoNetworkError" ||
    error.name === "MongoNetworkTimeoutError" ||
    error.name === "MongoTopologyClosedError"
  ) {
    return true;
  }
  const code =
    typeof error === "object" && "code" in error ? Number(error.code) : NaN;
  return error.name === "MongoServerError" && [13, 18].includes(code);
}

async function activateLocalFallback(error: unknown): Promise<void> {
  mongodbConnected = false;
  lastDiagnostic = sanitizedDiagnostic(error);
  try {
    if (!localJsonReady) {
      await initializeLocalJson();
      localJsonReady = true;
    }
    storageMode = "local-json";
    logger.warn(
      {
        storageMode,
        errorName: error instanceof Error ? error.name : "UnknownError",
        diagnostic: lastDiagnostic,
      },
      "MongoDB request failed; switched to persistent local JSON storage",
    );
  } catch (localError) {
    storageMode = "unavailable";
    lastDiagnostic = `Local JSON storage could not be initialized: ${sanitizedDiagnostic(localError)}`;
    logger.error(
      {
        errorName:
          localError instanceof Error ? localError.name : "UnknownError",
      },
      "Local JSON fallback is unavailable",
    );
  }
}

export async function withActiveStorage<T>(
  mongoOperation: () => Promise<T>,
  localOperation: () => Promise<T>,
): Promise<T> {
  if (storageMode === "local-json") return localOperation();
  if (storageMode === "unavailable") {
    throw new Error(getStorageHealth().message);
  }

  try {
    return await mongoOperation();
  } catch (error) {
    if (!isMongoUnavailable(error)) throw error;
    await activateLocalFallback(error);
    if (getStorageHealth().storageMode !== "local-json") {
      throw new Error(getStorageHealth().message);
    }
    return localOperation();
  }
}

export async function mirrorIncident(record: IncidentRecord): Promise<void> {
  if (localJsonReady) await upsertLocalIncident(record);
}

export async function mirrorVulnerability(
  record: VulnerabilityRecord,
): Promise<void> {
  if (localJsonReady) await upsertLocalVulnerability(record);
}

export async function removeMirroredIncident(id: string): Promise<void> {
  if (localJsonReady) await deleteLocalIncident(id);
}

export async function removeMirroredVulnerability(
  id: string,
): Promise<void> {
  if (localJsonReady) await deleteLocalVulnerability(id);
}
