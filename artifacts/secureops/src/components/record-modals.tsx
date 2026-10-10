import { useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Form } from '@/components/ui/form';
import {
  getGetDashboardSummaryQueryKey, getGetIncidentQueryKey, getGetVulnerabilityQueryKey,
  getListIncidentsQueryKey, getListVulnerabilitiesQueryKey,
  useCreateIncident, useCreateVulnerability, useDeleteIncident, useDeleteVulnerability,
  useGetIncident, useGetVulnerability, useUpdateIncident, useUpdateVulnerability,
} from '@workspace/api-client-react';
import type { Incident, IncidentInput, IncidentStatus, IncidentUpdate, Severity, Vulnerability, VulnerabilityInput, VulnerabilityStatus, VulnerabilityUpdate } from '@workspace/api-client-react';
import { AlertTriangle, LoaderCircle, Pencil, Trash2, X } from 'lucide-react';
import { errorMessage } from '@/lib/api-error';
import { SeverityBadge, StatusBadge } from '@/components/secure-shell';

const severities = ['Critical', 'High', 'Medium', 'Low'] as const;
const incidentStatuses = ['Open', 'Investigating', 'Contained', 'Resolved', 'Closed'] as const;
const vulnerabilityStatuses = ['Open', 'In Progress', 'Mitigated', 'Accepted'] as const;

const incidentSchema = z.object({
  title: z.string().trim().min(3, 'Use at least 3 characters.').max(120, 'Keep the title under 120 characters.'),
  description: z.string().trim().min(10, 'Add at least 10 characters of context.').max(5000, 'Description is too long.'),
  severity: z.enum(severities),
  status: z.enum(incidentStatuses),
  affectedAsset: z.string().max(160, 'Keep the asset under 160 characters.'),
  assignee: z.string().max(120, 'Keep the owner under 120 characters.'),
});
const vulnerabilitySchema = z.object({
  title: z.string().trim().min(3, 'Use at least 3 characters.').max(120, 'Keep the title under 120 characters.'),
  affectedAsset: z.string().trim().min(1, 'Affected asset is required.').max(160, 'Keep the asset under 160 characters.'),
  description: z.string().trim().min(10, 'Add at least 10 characters of context.').max(5000, 'Description is too long.'),
  severity: z.enum(severities),
  status: z.enum(vulnerabilityStatuses),
  cveId: z.string().max(32, 'Keep the CVE ID under 32 characters.'),
});
type IncidentFormValues = z.infer<typeof incidentSchema>;
type VulnerabilityFormValues = z.infer<typeof vulnerabilitySchema>;

function Modal({ title, eyebrow, onClose, children }: { title: string; eyebrow: string; onClose: () => void; children: ReactNode }) {
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }} data-testid="modal-backdrop">
    <section className="modal" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-head"><div><div className="eyebrow">{eyebrow}</div><h2 className="modal-title">{title}</h2></div>
        <button type="button" className="icon-btn" aria-label="Close dialog" onClick={onClose} data-testid="button-close-modal"><X size={15} /></button>
      </div>
      <div className="modal-content">{children}</div>
    </section>
  </div>;
}

function Field({ label, error, children, full = false }: { label: string; error?: string; children: ReactNode; full?: boolean }) {
  return <label className={`form-field ${full ? 'full' : ''}`}><span className="field-label">{label}</span>{children}{error && <span className="field-error">{error}</span>}</label>;
}

function FormActions({ pending, onCancel, submitLabel }: { pending: boolean; onCancel: () => void; submitLabel: string }) {
  return <div className="form-actions"><button type="button" className="btn btn-secondary" onClick={onCancel} data-testid="button-cancel-form">Cancel</button>
    <button className="btn btn-primary" disabled={pending} type="submit" data-testid="button-submit-form">{pending && <LoaderCircle size={13} className="animate-spin" />}{pending ? 'Saving…' : submitLabel}</button></div>;
}

function invalidateIncidentData(queryClient: ReturnType<typeof useQueryClient>, id?: string) {
  void queryClient.invalidateQueries({ queryKey: getListIncidentsQueryKey() });
  void queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
  if (id) void queryClient.invalidateQueries({ queryKey: getGetIncidentQueryKey(id) });
}
function invalidateVulnerabilityData(queryClient: ReturnType<typeof useQueryClient>, id?: string) {
  void queryClient.invalidateQueries({ queryKey: getListVulnerabilitiesQueryKey() });
  void queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
  if (id) void queryClient.invalidateQueries({ queryKey: getGetVulnerabilityQueryKey(id) });
}

function IncidentForm({ initial, onClose }: { initial?: Incident; onClose: () => void }) {
  const queryClient = useQueryClient();
  const create = useCreateIncident();
  const update = useUpdateIncident();
  const [serverError, setServerError] = useState('');
  const form = useForm<IncidentFormValues>({
    resolver: zodResolver(incidentSchema),
    defaultValues: initial ? { title: initial.title, description: initial.description, severity: initial.severity, status: initial.status, affectedAsset: initial.affectedAsset ?? '', assignee: initial.assignee ?? '' } :
      { title: '', description: '', severity: 'Medium', status: 'Open', affectedAsset: '', assignee: '' },
  });
  const pending = create.isPending || update.isPending;
  const submit = async (values: IncidentFormValues) => {
    setServerError('');
    const core = {
      title: values.title.trim(), description: values.description.trim(), severity: values.severity as Severity,
      status: values.status as IncidentStatus,
    };
    try {
      if (initial) {
        const body: IncidentUpdate = { ...core, affectedAsset: values.affectedAsset.trim(), assignee: values.assignee.trim() };
        await update.mutateAsync({ incidentId: initial.id, data: body });
      } else {
        const body: IncidentInput = { ...core, ...(values.affectedAsset.trim() ? { affectedAsset: values.affectedAsset.trim() } : {}), ...(values.assignee.trim() ? { assignee: values.assignee.trim() } : {}) };
        await create.mutateAsync({ data: body });
      }
      invalidateIncidentData(queryClient, initial?.id);
      onClose();
    } catch (error) { setServerError(errorMessage(error)); }
  };
  return <Modal title={initial ? 'Update incident' : 'Register incident'} eyebrow={initial ? `INCIDENT / ${initial.id}` : 'NEW INCIDENT'} onClose={onClose}>
    {serverError && <div role="alert" className="form-error" data-testid="error-form">{serverError}</div>}
    <Form {...form}><form onSubmit={form.handleSubmit(submit)} noValidate>
      <div className="form-grid">
        <Field label="Incident title" error={form.formState.errors.title?.message} full><input className="field-control" placeholder="Concise signal or event" maxLength={120} {...form.register('title')} data-testid="input-incident-title" /></Field>
        <Field label="Severity" error={form.formState.errors.severity?.message}><select className="field-control" {...form.register('severity')} data-testid="select-incident-severity">{severities.map(v => <option key={v}>{v}</option>)}</select></Field>
        <Field label="Status" error={form.formState.errors.status?.message}><select className="field-control" {...form.register('status')} data-testid="select-incident-status">{incidentStatuses.map(v => <option key={v}>{v}</option>)}</select></Field>
        <Field label="Affected asset" error={form.formState.errors.affectedAsset?.message}><input className="field-control" placeholder="Host, account, service…" maxLength={160} {...form.register('affectedAsset')} data-testid="input-incident-asset" /></Field>
        <Field label="Assignee" error={form.formState.errors.assignee?.message}><input className="field-control" placeholder="Analyst or team" maxLength={120} {...form.register('assignee')} data-testid="input-incident-assignee" /></Field>
        <Field label="Description" error={form.formState.errors.description?.message} full><textarea className="field-control" rows={5} placeholder="What was observed, impact, and response context…" maxLength={5000} {...form.register('description')} data-testid="input-incident-description" /></Field>
      </div>
      <FormActions pending={pending} onCancel={onClose} submitLabel={initial ? 'Save changes' : 'Create incident'} />
    </form></Form>
  </Modal>;
}

function VulnerabilityForm({ initial, onClose }: { initial?: Vulnerability; onClose: () => void }) {
  const queryClient = useQueryClient();
  const create = useCreateVulnerability();
  const update = useUpdateVulnerability();
  const [serverError, setServerError] = useState('');
  const form = useForm<VulnerabilityFormValues>({
    resolver: zodResolver(vulnerabilitySchema),
    defaultValues: initial ? { title: initial.title, affectedAsset: initial.affectedAsset, description: initial.description, severity: initial.severity, status: initial.status, cveId: initial.cveId ?? '' } :
      { title: '', affectedAsset: '', description: '', severity: 'Medium', status: 'Open', cveId: '' },
  });
  const pending = create.isPending || update.isPending;
  const submit = async (values: VulnerabilityFormValues) => {
    setServerError('');
    const core = {
      title: values.title.trim(), affectedAsset: values.affectedAsset.trim(), description: values.description.trim(),
      severity: values.severity as Severity, status: values.status as VulnerabilityStatus,
    };
    try {
      if (initial) {
        const body: VulnerabilityUpdate = { ...core, cveId: values.cveId.trim() };
        await update.mutateAsync({ vulnerabilityId: initial.id, data: body });
      } else {
        const body: VulnerabilityInput = { ...core, ...(values.cveId.trim() ? { cveId: values.cveId.trim() } : {}) };
        await create.mutateAsync({ data: body });
      }
      invalidateVulnerabilityData(queryClient, initial?.id);
      onClose();
    } catch (error) { setServerError(errorMessage(error)); }
  };
  return <Modal title={initial ? 'Update vulnerability' : 'Register vulnerability'} eyebrow={initial ? `FINDING / ${initial.id}` : 'NEW VULNERABILITY'} onClose={onClose}>
    {serverError && <div role="alert" className="form-error" data-testid="error-form">{serverError}</div>}
    <Form {...form}><form onSubmit={form.handleSubmit(submit)} noValidate>
      <div className="form-grid">
        <Field label="Finding title" error={form.formState.errors.title?.message} full><input className="field-control" placeholder="Vulnerability summary" maxLength={120} {...form.register('title')} data-testid="input-vulnerability-title" /></Field>
        <Field label="Affected asset" error={form.formState.errors.affectedAsset?.message}><input className="field-control" placeholder="Hostname or application" maxLength={160} {...form.register('affectedAsset')} data-testid="input-vulnerability-asset" /></Field>
        <Field label="CVE identifier" error={form.formState.errors.cveId?.message}><input className="field-control" placeholder="CVE-YYYY-NNNN" maxLength={32} {...form.register('cveId')} data-testid="input-vulnerability-cve" /></Field>
        <Field label="Severity" error={form.formState.errors.severity?.message}><select className="field-control" {...form.register('severity')} data-testid="select-vulnerability-severity">{severities.map(v => <option key={v}>{v}</option>)}</select></Field>
        <Field label="Status" error={form.formState.errors.status?.message}><select className="field-control" {...form.register('status')} data-testid="select-vulnerability-status">{vulnerabilityStatuses.map(v => <option key={v}>{v}</option>)}</select></Field>
        <Field label="Description" error={form.formState.errors.description?.message} full><textarea className="field-control" rows={5} placeholder="Affected component, exploitability, and remediation context…" maxLength={5000} {...form.register('description')} data-testid="input-vulnerability-description" /></Field>
      </div>
      <FormActions pending={pending} onCancel={onClose} submitLabel={initial ? 'Save changes' : 'Create finding'} />
    </form></Form>
  </Modal>;
}

function IncidentDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const detail = useGetIncident(id, { query: { queryKey: getGetIncidentQueryKey(id), enabled: !!id } });
  const remove = useDeleteIncident();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [actionError, setActionError] = useState('');
  const record = detail.data;
  const onDelete = async () => {
    setActionError('');
    try {
      const result = await remove.mutateAsync({ incidentId: id });
      if (!result.deleted) { setActionError('The server did not confirm deletion. The incident remains in the list.'); return; }
      invalidateIncidentData(queryClient, id);
      onClose();
    } catch (error) { setActionError(errorMessage(error)); }
  };
  if (editing && record) return <IncidentForm initial={record} onClose={() => { setEditing(false); void detail.refetch(); }} />;
  return <Modal title={record?.title ?? 'Incident record'} eyebrow={`INCIDENT / ${id}`} onClose={onClose}>
    {detail.isLoading ? <div className="loading-state" data-testid="loading-incident-detail"><div className="skeleton" style={{ height: 11, width: '50%', margin: 'auto' }} /><div className="skeleton" style={{ height: 80, margin: '18px auto', maxWidth: 480 }} /></div> :
      detail.isError ? <div className="inline-error" role="alert" data-testid="error-incident-detail">{errorMessage(detail.error)}<button className="row-action" onClick={() => void detail.refetch()}>Retry</button></div> :
      record ? <RecordDetail record={record} onEdit={() => setEditing(true)} onDelete={() => setConfirmDelete(true)} pending={remove.isPending} /> : null}
    {confirmDelete && <div className="form-error" data-testid="confirm-delete"><strong>Delete this incident?</strong><div style={{ marginTop: 5 }}>This record will be permanently removed.</div><div style={{ display: 'flex', gap: 8, marginTop: 11 }}><button className="btn btn-danger" disabled={remove.isPending} onClick={() => void onDelete()} data-testid="button-confirm-delete">{remove.isPending ? 'Deleting…' : 'Delete incident'}</button><button className="btn btn-secondary" onClick={() => setConfirmDelete(false)} data-testid="button-cancel-delete">Keep record</button></div></div>}
    {actionError && <div role="alert" className="form-error" data-testid="error-delete">{actionError}</div>}
  </Modal>;
}

function VulnerabilityDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const detail = useGetVulnerability(id, { query: { queryKey: getGetVulnerabilityQueryKey(id), enabled: !!id } });
  const remove = useDeleteVulnerability();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [actionError, setActionError] = useState('');
  const record = detail.data;
  const onDelete = async () => {
    setActionError('');
    try {
      const result = await remove.mutateAsync({ vulnerabilityId: id });
      if (!result.deleted) { setActionError('The server did not confirm deletion. The finding remains in the list.'); return; }
      invalidateVulnerabilityData(queryClient, id);
      onClose();
    } catch (error) { setActionError(errorMessage(error)); }
  };
  if (editing && record) return <VulnerabilityForm initial={record} onClose={() => { setEditing(false); void detail.refetch(); }} />;
  return <Modal title={record?.title ?? 'Vulnerability record'} eyebrow={`FINDING / ${id}`} onClose={onClose}>
    {detail.isLoading ? <div className="loading-state" data-testid="loading-vulnerability-detail"><div className="skeleton" style={{ height: 11, width: '50%', margin: 'auto' }} /><div className="skeleton" style={{ height: 80, margin: '18px auto', maxWidth: 480 }} /></div> :
      detail.isError ? <div className="inline-error" role="alert" data-testid="error-vulnerability-detail">{errorMessage(detail.error)}<button className="row-action" onClick={() => void detail.refetch()}>Retry</button></div> :
      record ? <RecordDetail record={record} onEdit={() => setEditing(true)} onDelete={() => setConfirmDelete(true)} pending={remove.isPending} /> : null}
    {confirmDelete && <div className="form-error" data-testid="confirm-delete"><strong>Delete this vulnerability?</strong><div style={{ marginTop: 5 }}>This record will be permanently removed.</div><div style={{ display: 'flex', gap: 8, marginTop: 11 }}><button className="btn btn-danger" disabled={remove.isPending} onClick={() => void onDelete()} data-testid="button-confirm-delete">{remove.isPending ? 'Deleting…' : 'Delete finding'}</button><button className="btn btn-secondary" onClick={() => setConfirmDelete(false)} data-testid="button-cancel-delete">Keep record</button></div></div>}
    {actionError && <div role="alert" className="form-error" data-testid="error-delete">{actionError}</div>}
  </Modal>;
}

function RecordDetail({ record, onEdit, onDelete, pending }: { record: Incident | Vulnerability; onEdit: () => void; onDelete: () => void; pending: boolean }) {
  const incident = !('cveId' in record);
  return <div data-testid={`detail-record-${record.id}`}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}><SeverityBadge severity={record.severity} /><StatusBadge status={record.status} />{'cveId' in record && record.cveId && <span className="mono">{record.cveId}</span>}</div>
    <div className="detail-meta">
      <div className="detail-box"><div className="detail-box-label">Affected asset</div><div className="detail-box-value">{record.affectedAsset || 'Not specified'}</div></div>
      {incident ? <div className="detail-box"><div className="detail-box-label">Assignee</div><div className="detail-box-value">{(record as Incident).assignee || 'Unassigned'}</div></div> :
        <div className="detail-box"><div className="detail-box-label">CVE identifier</div><div className="detail-box-value">{(record as Vulnerability).cveId || 'Not provided'}</div></div>}
      <div className="detail-box"><div className="detail-box-label">Created</div><div className="detail-box-value">{new Date(record.createdAt).toLocaleString()}</div></div>
      <div className="detail-box"><div className="detail-box-label">Last updated</div><div className="detail-box-value">{new Date(record.updatedAt).toLocaleString()}</div></div>
    </div>
    <div className="detail-box"><div className="detail-box-label">Description / response context</div><p className="detail-description">{record.description}</p></div>
    <div className="form-actions"><button className="btn btn-danger" disabled={pending} onClick={onDelete} data-testid="button-delete-record"><Trash2 size={13} />Delete</button>
      <button className="btn btn-primary" onClick={onEdit} data-testid="button-edit-record"><Pencil size={13} />Edit record</button></div>
  </div>;
}

export function CreateRecordModal({ kind, onClose }: { kind: 'incident' | 'vulnerability'; onClose: () => void }) {
  return kind === 'incident' ? <IncidentForm onClose={onClose} /> : <VulnerabilityForm onClose={onClose} />;
}

export function RecordModal({ kind, id, onClose }: { kind: 'incident' | 'vulnerability'; id: string; onClose: () => void }) {
  return kind === 'incident' ? <IncidentDetail id={id} onClose={onClose} /> : <VulnerabilityDetail id={id} onClose={onClose} />;
}
