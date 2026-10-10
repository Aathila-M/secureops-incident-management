import { useGetDashboardSummary, getGetDashboardSummaryQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Bug, RotateCw, Siren } from 'lucide-react';
import { Link } from 'wouter';
import { ErrorState, PageHeading } from '@/components/secure-shell';
import { errorMessage } from '@/lib/api-error';

const severityOrder = ['Critical', 'High', 'Medium', 'Low'];
const colors: Record<string, string> = { Critical: '#e4535d', High: '#e98b45', Medium: '#c9a847', Low: '#3aa982' };

function SeverityChart({ title, subtitle, counts, total }: { title: string; subtitle: string; counts: { severity: string; count: number }[]; total: number }) {
  const map = new Map(counts.map(item => [item.severity, item.count]));
  const values = severityOrder.map(severity => ({ severity, count: map.get(severity) ?? 0 }));
  const max = Math.max(1, ...values.map(item => item.count));
  return <section className="surface panel" data-testid={`chart-${title.toLowerCase().replaceAll(' ', '-')}`}>
    <div className="panel-heading"><div><h2 className="panel-title">{title}</h2><div className="panel-meta">{subtitle}</div></div>
      <span className="mono">{total} TOTAL</span>
    </div>
    <div className="severity-list">
      {values.map(({ severity, count }) => <div className="severity-row" key={severity} data-testid={`metric-${title.toLowerCase().replaceAll(' ', '-')}-${severity.toLowerCase()}`}>
        <span className="severity-name">{severity}</span>
        <div className="severity-track"><div className="severity-fill" style={{ width: `${count === 0 ? 0 : Math.max(5, count / max * 100)}%`, background: colors[severity] }} /></div>
        <span className="severity-count">{count}</span>
      </div>)}
    </div>
  </section>;
}

export default function Dashboard() {
  const queryClient = useQueryClient();
  const summary = useGetDashboardSummary();
  const data = summary.data;
  return <div className="page">
    <PageHeading eyebrow="Threat picture / 01" title="Operations overview" subtitle="A live view of incident response and vulnerability exposure." />
    {summary.isLoading ? <div className="stat-grid">{[0, 1, 2, 3].map(i => <div className="surface stat-card" key={i}><div className="skeleton" style={{ width: 100, height: 9 }} /><div className="skeleton" style={{ width: 68, height: 27, marginTop: 18 }} /><div className="skeleton" style={{ width: 120, height: 8, marginTop: 12 }} /></div>)}</div> : summary.isError ? <ErrorState message={errorMessage(summary.error)} onRetry={() => void queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() })} /> : data ? <>
      <div className="stat-grid">
        <div className="surface stat-card" data-testid="metric-total-incidents"><div className="stat-label">Total incidents</div><div className="stat-value">{data.totalIncidents}</div><div className="stat-foot"><span className="stat-accent">{data.openIncidents}</span> requiring ownership</div></div>
        <div className="surface stat-card" data-testid="metric-open-incidents"><div className="stat-label">Open incidents</div><div className="stat-value">{data.openIncidents}</div><div className="stat-foot">Across active response states</div></div>
        <div className="surface stat-card" data-testid="metric-critical-incidents"><div className="stat-label">Critical incidents</div><div className="stat-value" style={{ color: data.criticalIncidents > 0 ? '#ff8588' : undefined }}>{data.criticalIncidents}</div><div className="stat-foot">Highest-priority signals</div></div>
        <div className="surface stat-card" data-testid="metric-total-vulnerabilities"><div className="stat-label">Open vulnerabilities</div><div className="stat-value">{data.openVulnerabilities}</div><div className="stat-foot">of {data.totalVulnerabilities} tracked findings</div></div>
      </div>
      <div className="dashboard-grid">
        <SeverityChart title="Incident severity" subtitle="Current incident distribution" counts={data.incidentsBySeverity} total={data.totalIncidents} />
        <SeverityChart title="Vulnerability severity" subtitle="Current vulnerability distribution" counts={data.vulnerabilitiesBySeverity} total={data.totalVulnerabilities} />
      </div>
      <div style={{ marginTop: 15, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 12 }}>
        <Link className="dash-link" href="/incidents" data-testid="link-open-incidents">
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}><span className="brand-mark"><Siren size={16} /></span><div><div className="dash-link-label">Incident response</div><div className="dash-link-sub">{data.openIncidents} open · {data.criticalIncidents} critical</div></div></div><ArrowRight size={15} />
        </Link>
        <Link className="dash-link" href="/vulnerabilities" data-testid="link-open-vulnerabilities">
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}><span className="brand-mark"><Bug size={16} /></span><div><div className="dash-link-label">Exposure management</div><div className="dash-link-sub">{data.openVulnerabilities} findings open</div></div></div><ArrowRight size={15} />
        </Link>
      </div>
      <div style={{ marginTop: 19, display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-quiet" onClick={() => void queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() })} data-testid="button-refresh-dashboard"><RotateCw size={12} />Refresh data</button>
      </div>
    </> : null}
  </div>;
}
