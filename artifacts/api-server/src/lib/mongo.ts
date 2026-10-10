import { MongoClient, type Collection, type Db, type ObjectId } from "mongodb";
import type { IncidentStatus, Severity, VulnerabilityStatus } from "@workspace/api-zod";
import { logger } from "./logger";

export interface IncidentDocument {
  _id: ObjectId;
  title: string;
  description: string;
  severity: Severity;
  status: IncidentStatus;
  affectedAsset: string | null;
  assignee: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface VulnerabilityDocument {
  _id: ObjectId;
  title: string;
  affectedAsset: string;
  description: string;
  severity: Severity;
  status: VulnerabilityStatus;
  cveId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

let databasePromise: Promise<Db> | undefined;

export function getDatabase(): Promise<Db> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not configured");
  }

  if (!databasePromise) {
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5_000 });
    databasePromise = client
      .connect()
      .then(() => {
        const database = client.db(process.env.MONGODB_DATABASE || "secureops");
        logger.info({ database: database.databaseName }, "MongoDB connected");
        return database;
      })
      .catch(async (error: unknown) => {
        databasePromise = undefined;
        await client.close().catch(() => undefined);
        throw error;
      });
  }

  return databasePromise;
}

export async function getIncidentCollection(): Promise<
  Collection<IncidentDocument>
> {
  return (await getDatabase()).collection<IncidentDocument>("incidents");
}

export async function getVulnerabilityCollection(): Promise<
  Collection<VulnerabilityDocument>
> {
  return (await getDatabase()).collection<VulnerabilityDocument>(
    "vulnerabilities",
  );
}
