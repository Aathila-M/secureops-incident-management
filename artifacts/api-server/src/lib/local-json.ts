import { mkdir, readFile, rename, chmod, writeFile } from "node:fs/promises";
import path from "node:path";
import { ObjectId } from "mongodb";
import type {
  IncidentStatus,
  Severity,
  VulnerabilityStatus,
} from "@workspace/api-zod";

export interface IncidentRecord {
  id: string;
  title: string;
  description: string;
  severity: Severity;
  status: IncidentStatus;
  affectedAsset: string | null;
  assignee: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VulnerabilityRecord {
  id: string;
  title: string;
  affectedAsset: string;
  description: string;
  severity: Severity;
  status: VulnerabilityStatus;
  cveId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IncidentInput {
  title: string;
  description: string;
  severity: Severity;
  status?: IncidentStatus;
  affectedAsset?: string | null;
  assignee?: string | null;
}

export interface VulnerabilityInput {
  title: string;
  affectedAsset: string;
  description: string;
  severity: Severity;
  status?: VulnerabilityStatus;
  cveId?: string | null;
}

export interface IncidentFilters {
  search?: string;
  severity?: Severity;
  status?: IncidentStatus;
}

export interface VulnerabilityFilters {
  search?: string;
  severity?: Severity;
  status?: VulnerabilityStatus;
}

export interface DashboardSummary {
  totalIncidents: number;
  openIncidents: number;
  criticalIncidents: number;
  totalVulnerabilities: number;
  openVulnerabilities: number;
  incidentsBySeverity: { severity: Severity; count: number }[];
  vulnerabilitiesBySeverity: { severity: Severity; count: number }[];
}

export interface LocalState {
  incidents: IncidentRecord[];
  vulnerabilities: VulnerabilityRecord[];
  deletedIncidentIds: string[];
  deletedVulnerabilityIds: string[];
}

const dataDirectory = path.resolve(process.cwd(), "data");
export const localJsonPath = path.join(dataDirectory, "secureops.json");
const severities: Severity[] = ["Critical", "High", "Medium", "Low"];
let writeQueue: Promise<void> = Promise.resolve();

function emptyState(): LocalState {
  return {
    incidents: [],
    vulnerabilities: [],
    deletedIncidentIds: [],
    deletedVulnerabilityIds: [],
  };
}

async function readState(): Promise<LocalState> {
  let text: string;
  try {
    text = await readFile(localJsonPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyState();
    throw error;
  }

  const parsed: unknown = JSON.parse(text);
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("incidents" in parsed) ||
    !Array.isArray(parsed.incidents) ||
    !("vulnerabilities" in parsed) ||
    !Array.isArray(parsed.vulnerabilities)
  ) {
    throw new Error("Local JSON data has an invalid format.");
  }
  const data = parsed as Partial<LocalState>;
  return {
    incidents: data.incidents as IncidentRecord[],
    vulnerabilities: data.vulnerabilities as VulnerabilityRecord[],
    deletedIncidentIds: data.deletedIncidentIds ?? [],
    deletedVulnerabilityIds: data.deletedVulnerabilityIds ?? [],
  };
}

async function writeState(state: LocalState): Promise<void> {
  await mkdir(dataDirectory, { recursive: true, mode: 0o700 });
  const temporaryPath = `${localJsonPath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(temporaryPath, localJsonPath);
  await chmod(dataDirectory, 0o700);
  await chmod(localJsonPath, 0o600);
}

function transact<T>(
  shouldWrite: boolean,
  operation: (state: LocalState) => T,
): Promise<T> {
  const result = writeQueue.then(async () => {
    const state = await readState();
    const value = operation(state);
    if (shouldWrite) await writeState(state);
    return value;
  });
  writeQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

export async function initializeLocalJson(): Promise<void> {
  await mkdir(dataDirectory, { recursive: true, mode: 0o700 });
  let fileExists = true;
  try {
    await readFile(localJsonPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") fileExists = false;
    else throw error;
  }
  if (fileExists) await readState();
  else await writeState(emptyState());
  await chmod(dataDirectory, 0o700);
  await chmod(localJsonPath, 0o600);
}

export function getLocalSnapshot(): Promise<LocalState> {
  return transact(false, (state) => state);
}

export function replaceLocalSnapshot(
  state: Pick<LocalState, "incidents" | "vulnerabilities">,
): Promise<void> {
  return transact(true, (current) => {
    current.incidents = state.incidents;
    current.vulnerabilities = state.vulnerabilities;
    current.deletedIncidentIds = [];
    current.deletedVulnerabilityIds = [];
  });
}

export function listLocalIncidents(
  filters: IncidentFilters,
): Promise<IncidentRecord[]> {
  return transact(false, ({ incidents }) => {
    const search = filters.search?.trim().toLocaleLowerCase();
    return incidents
      .filter((record) => !filters.severity || record.severity === filters.severity)
      .filter((record) => !filters.status || record.status === filters.status)
      .filter(
        (record) =>
          !search ||
          [
            record.title,
            record.description,
            record.affectedAsset ?? "",
            record.assignee ?? "",
          ].some((value) => value.toLocaleLowerCase().includes(search)),
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 500);
  });
}

export function createLocalIncident(
  input: IncidentInput,
  id = new ObjectId().toHexString(),
  now = new Date().toISOString(),
): Promise<IncidentRecord> {
  return transact(true, (state) => {
    const record: IncidentRecord = {
      id,
      title: input.title.trim(),
      description: input.description.trim(),
      severity: input.severity,
      status: input.status ?? "Open",
      affectedAsset: input.affectedAsset?.trim() || null,
      assignee: input.assignee?.trim() || null,
      createdAt: now,
      updatedAt: now,
    };
    state.incidents.push(record);
    return record;
  });
}

export function getLocalIncident(id: string): Promise<IncidentRecord | null> {
  return transact(false, ({ incidents }) =>
    incidents.find((record) => record.id === id) ?? null,
  );
}

export function updateLocalIncident(
  id: string,
  changes: Partial<Omit<IncidentRecord, "id" | "createdAt" | "updatedAt">>,
  updatedAt = new Date().toISOString(),
): Promise<IncidentRecord | null> {
  return transact(true, (state) => {
    const index = state.incidents.findIndex((record) => record.id === id);
    if (index < 0) return null;
    const current = state.incidents[index];
    const updated: IncidentRecord = { ...current, ...changes, updatedAt };
    state.incidents[index] = updated;
    return updated;
  });
}

export function upsertLocalIncident(record: IncidentRecord): Promise<void> {
  return transact(true, (state) => {
    const index = state.incidents.findIndex((item) => item.id === record.id);
    if (index < 0) state.incidents.push(record);
    else state.incidents[index] = record;
  });
}

export function deleteLocalIncident(
  id: string,
  rememberForMongoSync = false,
): Promise<boolean> {
  return transact(true, (state) => {
    const previousLength = state.incidents.length;
    state.incidents = state.incidents.filter((record) => record.id !== id);
    const deleted = state.incidents.length !== previousLength;
    if (
      deleted &&
      rememberForMongoSync &&
      !state.deletedIncidentIds.includes(id)
    ) {
      state.deletedIncidentIds.push(id);
    }
    return deleted;
  });
}

export function listLocalVulnerabilities(
  filters: VulnerabilityFilters,
): Promise<VulnerabilityRecord[]> {
  return transact(false, ({ vulnerabilities }) => {
    const search = filters.search?.trim().toLocaleLowerCase();
    return vulnerabilities
      .filter((record) => !filters.severity || record.severity === filters.severity)
      .filter((record) => !filters.status || record.status === filters.status)
      .filter(
        (record) =>
          !search ||
          [
            record.title,
            record.description,
            record.affectedAsset,
            record.cveId ?? "",
          ].some((value) => value.toLocaleLowerCase().includes(search)),
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 500);
  });
}

export function createLocalVulnerability(
  input: VulnerabilityInput,
  id = new ObjectId().toHexString(),
  now = new Date().toISOString(),
): Promise<VulnerabilityRecord> {
  return transact(true, (state) => {
    const record: VulnerabilityRecord = {
      id,
      title: input.title.trim(),
      affectedAsset: input.affectedAsset.trim(),
      description: input.description.trim(),
      severity: input.severity,
      status: input.status ?? "Open",
      cveId: input.cveId?.trim() || null,
      createdAt: now,
      updatedAt: now,
    };
    state.vulnerabilities.push(record);
    return record;
  });
}

export function getLocalVulnerability(
  id: string,
): Promise<VulnerabilityRecord | null> {
  return transact(false, ({ vulnerabilities }) =>
    vulnerabilities.find((record) => record.id === id) ?? null,
  );
}

export function updateLocalVulnerability(
  id: string,
  changes: Partial<
    Omit<VulnerabilityRecord, "id" | "createdAt" | "updatedAt">
  >,
  updatedAt = new Date().toISOString(),
): Promise<VulnerabilityRecord | null> {
  return transact(true, (state) => {
    const index = state.vulnerabilities.findIndex((record) => record.id === id);
    if (index < 0) return null;
    const current = state.vulnerabilities[index];
    const updated: VulnerabilityRecord = { ...current, ...changes, updatedAt };
    state.vulnerabilities[index] = updated;
    return updated;
  });
}

export function upsertLocalVulnerability(
  record: VulnerabilityRecord,
): Promise<void> {
  return transact(true, (state) => {
    const index = state.vulnerabilities.findIndex(
      (item) => item.id === record.id,
    );
    if (index < 0) state.vulnerabilities.push(record);
    else state.vulnerabilities[index] = record;
  });
}

export function deleteLocalVulnerability(
  id: string,
  rememberForMongoSync = false,
): Promise<boolean> {
  return transact(true, (state) => {
    const previousLength = state.vulnerabilities.length;
    state.vulnerabilities = state.vulnerabilities.filter(
      (record) => record.id !== id,
    );
    const deleted = state.vulnerabilities.length !== previousLength;
    if (
      deleted &&
      rememberForMongoSync &&
      !state.deletedVulnerabilityIds.includes(id)
    ) {
      state.deletedVulnerabilityIds.push(id);
    }
    return deleted;
  });
}

export function summarizeLocalData(
  state: LocalState,
): DashboardSummary {
  return {
    totalIncidents: state.incidents.length,
    openIncidents: state.incidents.filter(
      (item) => !["Resolved", "Closed"].includes(item.status),
    ).length,
    criticalIncidents: state.incidents.filter(
      (item) => item.severity === "Critical",
    ).length,
    totalVulnerabilities: state.vulnerabilities.length,
    openVulnerabilities: state.vulnerabilities.filter((item) =>
      ["Open", "In Progress"].includes(item.status),
    ).length,
    incidentsBySeverity: severities.map((severity) => ({
      severity,
      count: state.incidents.filter((item) => item.severity === severity).length,
    })),
    vulnerabilitiesBySeverity: severities.map((severity) => ({
      severity,
      count: state.vulnerabilities.filter((item) => item.severity === severity)
        .length,
    })),
  };
}

export function getLocalDashboardSummary(): Promise<DashboardSummary> {
  return transact(false, summarizeLocalData);
}
