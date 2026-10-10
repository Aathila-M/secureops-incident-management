import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getListIncidentsQueryKey, getListVulnerabilitiesQueryKey,
  useListIncidents, useListVulnerabilities,
} from '@workspace/api-client-react';
import type { Incident, IncidentStatus, ListIncidentsParams, ListVulnerabilitiesParams, Severity, Vulnerability, VulnerabilityStatus } from '@workspace/api-client-react';
import { Plus, RotateCw, Search, ShieldAlert, Bug, ChevronRight } from 'lucide-react';
import { CreateRecordModal, RecordModal } from '@/components/record-modals';
import { ErrorState, LoadingRows, PageHeading, SeverityBadge, StatusBadge } from '@/components/secure-shell';
import { errorMessage } from '@/lib/api-error';

const severityOptions: Severity[] = ['Critical', 'High', 'Medium', 'Low'];
const incidentStatusOptions: IncidentStatus[] = ['Open', 'Investigating', 'Contained', 'Resolved', 'Closed'];
const vulnerabilityStatusOptions: VulnerabilityStatus[] = ['Open', 'In Progress', 'Mitigated', 'Accepted'];

type Kind = 'incident' | 'vulnerability';

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function Incidents() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [severity, setSeverity] = useState('');
  const [status, setStatus] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const params = useMemo<ListIncidentsParams>(() => ({
    ...(search.trim() ? { search: search.trim() } : {}),
    ...(severity ? { severity: severity as Severity } : {}),
    ...(status ? { status: status as IncidentStatus } : {}),
  }), [search, severity, status]);
  const query = useListIncidents(params);
  const records = query.data;
  return <>
    <div className="page">
      <PageHeading eyebrow="Signal / Response" title="Incidents" subtitle="Investigate, assign ownership, and drive each signal through containment."
        action={<button className="btn btn-primary" onClick={() => setCreateOpen(true)} data-testid="button-create-incident"><Plus size={14} />New incident</button>} />
      <div className="toolbar" role="search">
        <div className="search-wrap"><Search size={14} /><input className="control" placeholder="Search title, description, asset or owner" value={search} onChange={e => setSearch(e.target.value)} aria-label="Search incidents" data-testid="input-search-incidents" /></div>
        <select className="select-control" value={severity} onChange={e => setSeverity(e.target.value)} aria-label="Filter by severity" data-testid="filter-incident-severity"><option value="">All severities</option>{severityOptions.map(item => <option key={item} value={item}>{item}</option>)}</select>
        <select className="select-control" value={status} onChange={e => setStatus(e.target.value)} aria-label="Filter by status" data-testid="filter-incident-status"><option value="">All statuses</option>{incidentStatusOptions.map(item => <option key={item} value={item}>{item}</option>)}</select>
      </div>
      <div className="results-bar"><span>{query.isLoading ? 'FETCHING RECORDS' : `${records?.length ?? 0} INCIDENT${records?.length === 1 ? '' : 'S'} FOUND`}</span>
        <button className="btn btn-quiet" style={{ padding: 4 }} onClick={() => void query.refetch()} disabled={query.isFetching} data-testid="button-refresh-incidents"><RotateCw size={12} className={query.isFetching ? 'animate-spin' : ''} />Refresh</button>
      </div>
      {query.isLoading ? <LoadingRows /> : query.isError ? <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} /> :
        records?.length ? <div className="table-wrap"><table className="data-table">
          <thead><tr><th>Incident</th><th>Severity</th><th>Status</th><th>Affected asset</th><th>Assignee</th><th>Updated</th><th></th></tr></thead>
          <tbody>{records.map((incident: Incident) => <tr key={incident.id} data-testid={`row-incident-${incident.id}`}>
            <td><span className="record-title" data-testid={`text-incident-title-${incident.id}`}>{incident.title}</span><span className="record-desc">{incident.description}</span></td>
            <td><SeverityBadge severity={incident.severity} /></td><td><StatusBadge status={incident.status} /></td>
            <td>{incident.affectedAsset || <span className="mono">—</span>}</td><td>{incident.assignee || <span className="mono">Unassigned</span>}</td>
            <td className="mono">{dateLabel(incident.updatedAt)}</td><td><button className="row-action" onClick={() => setSelectedId(incident.id)} data-testid={`button-open-incident-${incident.id}`}>Open <ChevronRight size={12} style={{ verticalAlign: 'middle' }} /></button></td>
          </tr>)}</tbody>
        </table></div> : <div className="empty-state" data-testid="empty-incidents"><div className="state-icon"><ShieldAlert size={17} /></div><div className="state-title">{search || severity || status ? 'No matching incidents' : 'No incidents recorded'}</div><p className="state-copy">{search || severity || status ? 'Adjust the search or filters to see other incident records.' : 'When a security signal is registered, its ownership and response state will appear here.'}</p>{search || severity || status ? <button className="btn btn-secondary" onClick={() => { setSearch(''); setSeverity(''); setStatus(''); }} data-testid="button-clear-incident-filters">Clear filters</button> : <button className="btn btn-primary" onClick={() => setCreateOpen(true)} data-testid="button-create-first-incident"><Plus size={13} />Register incident</button>}</div>}
    </div>
    {createOpen && <CreateRecordModal kind="incident" onClose={() => setCreateOpen(false)} />}
    {selectedId && <RecordModal kind="incident" id={selectedId} onClose={() => { setSelectedId(null); void queryClient.invalidateQueries({ queryKey: getListIncidentsQueryKey() }); }} />}
  </>;
}

function Vulnerabilities() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [severity, setSeverity] = useState('');
  const [status, setStatus] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const params = useMemo<ListVulnerabilitiesParams>(() => ({
    ...(search.trim() ? { search: search.trim() } : {}),
    ...(severity ? { severity: severity as Severity } : {}),
    ...(status ? { status: status as VulnerabilityStatus } : {}),
  }), [search, severity, status]);
  const query = useListVulnerabilities(params);
  const records = query.data;
  return <>
    <div className="page">
      <PageHeading eyebrow="Exposure / Remediation" title="Vulnerabilities" subtitle="Track exploitable exposure from initial finding through mitigation or acceptance."
        action={<button className="btn btn-primary" onClick={() => setCreateOpen(true)} data-testid="button-create-vulnerability"><Plus size={14} />New finding</button>} />
      <div className="toolbar" role="search">
        <div className="search-wrap"><Search size={14} /><input className="control" placeholder="Search title, description, asset or CVE" value={search} onChange={e => setSearch(e.target.value)} aria-label="Search vulnerabilities" data-testid="input-search-vulnerabilities" /></div>
        <select className="select-control" value={severity} onChange={e => setSeverity(e.target.value)} aria-label="Filter by severity" data-testid="filter-vulnerability-severity"><option value="">All severities</option>{severityOptions.map(item => <option key={item} value={item}>{item}</option>)}</select>
        <select className="select-control" value={status} onChange={e => setStatus(e.target.value)} aria-label="Filter by status" data-testid="filter-vulnerability-status"><option value="">All statuses</option>{vulnerabilityStatusOptions.map(item => <option key={item} value={item}>{item}</option>)}</select>
      </div>
      <div className="results-bar"><span>{query.isLoading ? 'FETCHING RECORDS' : `${records?.length ?? 0} FINDING${records?.length === 1 ? '' : 'S'} FOUND`}</span>
        <button className="btn btn-quiet" style={{ padding: 4 }} onClick={() => void query.refetch()} disabled={query.isFetching} data-testid="button-refresh-vulnerabilities"><RotateCw size={12} className={query.isFetching ? 'animate-spin' : ''} />Refresh</button>
      </div>
      {query.isLoading ? <LoadingRows /> : query.isError ? <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} /> :
        records?.length ? <div className="table-wrap"><table className="data-table">
          <thead><tr><th>Vulnerability</th><th>Severity</th><th>Status</th><th>Affected asset</th><th>CVE</th><th>Updated</th><th></th></tr></thead>
          <tbody>{records.map((vulnerability: Vulnerability) => <tr key={vulnerability.id} data-testid={`row-vulnerability-${vulnerability.id}`}>
            <td><span className="record-title" data-testid={`text-vulnerability-title-${vulnerability.id}`}>{vulnerability.title}</span><span className="record-desc">{vulnerability.description}</span></td>
            <td><SeverityBadge severity={vulnerability.severity} /></td><td><StatusBadge status={vulnerability.status} /></td>
            <td>{vulnerability.affectedAsset}</td><td className="mono">{vulnerability.cveId || '—'}</td>
            <td className="mono">{dateLabel(vulnerability.updatedAt)}</td><td><button className="row-action" onClick={() => setSelectedId(vulnerability.id)} data-testid={`button-open-vulnerability-${vulnerability.id}`}>Open <ChevronRight size={12} style={{ verticalAlign: 'middle' }} /></button></td>
          </tr>)}</tbody>
        </table></div> : <div className="empty-state" data-testid="empty-vulnerabilities"><div className="state-icon"><Bug size={17} /></div><div className="state-title">{search || severity || status ? 'No matching vulnerabilities' : 'No vulnerabilities recorded'}</div><p className="state-copy">{search || severity || status ? 'Adjust your search or filters to see other findings.' : 'Registered findings will show their affected assets, severity, and remediation state here.'}</p>{search || severity || status ? <button className="btn btn-secondary" onClick={() => { setSearch(''); setSeverity(''); setStatus(''); }} data-testid="button-clear-vulnerability-filters">Clear filters</button> : <button className="btn btn-primary" onClick={() => setCreateOpen(true)} data-testid="button-create-first-vulnerability"><Plus size={13} />Register finding</button>}</div>}
    </div>
    {createOpen && <CreateRecordModal kind="vulnerability" onClose={() => setCreateOpen(false)} />}
    {selectedId && <RecordModal kind="vulnerability" id={selectedId} onClose={() => { setSelectedId(null); void queryClient.invalidateQueries({ queryKey: getListVulnerabilitiesQueryKey() }); }} />}
  </>;
}

export default function RecordsPage({ kind }: { kind: Kind }) {
  return kind === 'incident' ? <Incidents /> : <Vulnerabilities />;
}
