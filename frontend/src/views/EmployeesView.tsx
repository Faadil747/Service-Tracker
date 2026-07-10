import React, { useEffect, useState, useCallback } from 'react';
import {
    Users, UserPlus, Trash2, KeyRound, RefreshCw, X, Copy, Search, Shield,
} from 'lucide-react';
import { usersApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';

interface Props { region: string; }

const REGIONS = ['Global', 'India', 'USA', 'Indonesia'];
const ROLE_COLORS: Record<string, string> = { admin: '#7c3aed', ceo: '#db2777', developer: '#0891b2', agent: '#2563eb' };

export const EmployeesView: React.FC<Props> = () => {
    const { user } = useAuthStore();
    const isAdmin = user?.role === 'admin';

    const [employees, setEmployees] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState('all');
    const [showAdd, setShowAdd] = useState(false);
    const [creating, setCreating] = useState(false);
    const [form, setForm] = useState({ full_name: '', email: '', role: 'agent', region: 'Global', linkedin_url: '', password: '' });
    const [credential, setCredential] = useState<{ email: string; password: string } | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await usersApi.list();
            setEmployees(res.data);
        } catch { toast.error('Failed to load employees'); }
        setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    if (!isAdmin) {
        return (
            <div className="page-content">
                <div className="empty-state" style={{ padding: '80px 24px' }}>
                    <div className="empty-state-icon">🔒</div>
                    <div style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: 8 }}>Access Restricted</div>
                    <div style={{ fontSize: '0.85rem' }}>The Employees directory is only available to Admins.</div>
                </div>
            </div>
        );
    }

    const filtered = employees.filter(e => {
        if (roleFilter !== 'all' && e.role !== roleFilter) return false;
        const q = search.trim().toLowerCase();
        if (q && !(`${e.full_name} ${e.email} ${e.region}`.toLowerCase().includes(q))) return false;
        return true;
    });
    const counts = employees.reduce((m: Record<string, number>, e) => { m[e.role] = (m[e.role] || 0) + 1; return m; }, {});

    const resetForm = () => setForm({ full_name: '', email: '', role: 'agent', region: 'Global', linkedin_url: '', password: '' });

    const handleCreate = async () => {
        if (!form.full_name.trim() || !form.email.trim()) { toast.error('Name and email are required'); return; }
        setCreating(true);
        try {
            const res = await usersApi.create({
                full_name: form.full_name.trim(),
                email: form.email.trim(),
                role: form.role,
                region: form.region,
                linkedin_url: form.linkedin_url.trim(),
                ...(form.password.trim() ? { password: form.password.trim() } : {}),
            });
            setShowAdd(false);
            resetForm();
            setCredential({ email: res.data.email, password: res.data.temp_password });
            toast.success('Employee added');
            load();
        } catch (err: any) {
            toast.error(err?.response?.data?.detail || 'Failed to add employee');
        }
        setCreating(false);
    };

    const handleRemove = async (emp: any) => {
        if (emp.id === user?.id) { toast.error("You can't remove your own account"); return; }
        if (!window.confirm(`Remove ${emp.full_name}? They will be deactivated and lose access.`)) return;
        try {
            await usersApi.remove(emp.id);
            toast.success('Employee removed');
            load();
        } catch { toast.error('Failed to remove employee'); }
    };

    const handleReset = async (emp: any) => {
        if (!window.confirm(`Reset login credentials for ${emp.full_name}?`)) return;
        try {
            const res = await usersApi.resetCredentials(emp.id);
            setCredential({ email: res.data.email, password: res.data.new_password });
            toast.success('New password generated');
        } catch { toast.error('Failed to reset credentials'); }
    };

    const copy = (text: string) => navigator.clipboard.writeText(text).then(() => toast.success('Copied'));

    return (
        <div className="page-content animate-fade">
            <div className="page-header">
                <div className="page-header-left">
                    <div className="page-title">Employees</div>
                    <div className="page-subtitle">Team directory · add, remove and manage access</div>
                </div>
                <div className="page-header-right" style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-secondary btn-icon" onClick={load} title="Refresh"><RefreshCw size={15} style={{ animation: loading ? 'spin 0.7s linear infinite' : 'none' }} /></button>
                    <button className="btn btn-primary" onClick={() => { resetForm(); setShowAdd(true); }}><UserPlus size={15} /> Add Employee</button>
                </div>
            </div>

            {/* Role summary */}
            <div className="grid-4" style={{ marginBottom: 20 }}>
                {[
                    { label: 'Total', value: employees.length, color: '#2563eb', icon: Users },
                    { label: 'Agents', value: counts['agent'] || 0, color: ROLE_COLORS.agent, icon: Users },
                    { label: 'Admins', value: counts['admin'] || 0, color: ROLE_COLORS.admin, icon: Shield },
                    { label: 'Other roles', value: employees.length - (counts['agent'] || 0) - (counts['admin'] || 0), color: '#0891b2', icon: Users },
                ].map(({ label, value, color, icon: Icon }) => (
                    <div key={label} className="stat-card">
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                            <span className="stat-label">{label}</span>
                            <div style={{ width: 34, height: 34, borderRadius: 8, background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon size={16} color={color} /></div>
                        </div>
                        <div className="stat-number">{value}</div>
                    </div>
                ))}
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
                    <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input className="input" placeholder="Search by name, email, region…" value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 32 }} />
                </div>
                <select className="select" style={{ width: 'auto' }} value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
                    <option value="all">All roles</option>
                    <option value="agent">Agents</option>
                    <option value="admin">Admins</option>
                    <option value="ceo">CEO</option>
                    <option value="developer">Developers</option>
                </select>
            </div>

            {/* Directory table */}
            <div className="table-wrapper">
                <table className="data-table">
                    <thead><tr><th>Employee</th><th>Role</th><th>Region</th><th>Joined</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={5}><div className="empty-state">Loading…</div></td></tr>
                        ) : filtered.length === 0 ? (
                            <tr><td colSpan={5}><div className="empty-state">No employees match your filters</div></td></tr>
                        ) : filtered.map(emp => (
                            <tr key={emp.id}>
                                <td>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <div style={{ width: 34, height: 34, borderRadius: '50%', background: ROLE_COLORS[emp.role] || '#2563eb', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.8rem', flexShrink: 0 }}>{emp.full_name?.charAt(0)?.toUpperCase()}</div>
                                        <div>
                                            <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{emp.full_name}{emp.id === user?.id && <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 500 }}> · you</span>}</div>
                                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{emp.email}</div>
                                        </div>
                                    </div>
                                </td>
                                <td><span className="badge" style={{ background: (ROLE_COLORS[emp.role] || '#2563eb') + '22', color: ROLE_COLORS[emp.role] || '#2563eb', textTransform: 'capitalize' }}>{emp.role}</span></td>
                                <td><span className="badge badge-info">{emp.region || 'Global'}</span></td>
                                <td style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{emp.created_at ? new Date(emp.created_at).toLocaleDateString() : '—'}</td>
                                <td>
                                    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                                        <button className="btn btn-ghost btn-icon btn-sm" title="Reset credentials" onClick={() => handleReset(emp)}><KeyRound size={14} /></button>
                                        <button className="btn btn-ghost btn-icon btn-sm" title="Remove employee" onClick={() => handleRemove(emp)} disabled={emp.id === user?.id} style={{ color: emp.id === user?.id ? 'var(--text-muted)' : 'var(--danger)' }}><Trash2 size={14} /></button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Add Employee modal */}
            {showAdd && (
                <div className="modal-overlay" onClick={() => setShowAdd(false)}>
                    <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                            <h3>➕ Add Employee</h3>
                            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowAdd(false)}><X size={16} /></button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div className="grid-2" style={{ gap: 12 }}>
                                <div className="form-group"><label className="form-label">Full name *</label><input className="input" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} placeholder="Jane Doe" /></div>
                                <div className="form-group"><label className="form-label">Email *</label><input className="input" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="jane@company.com" /></div>
                            </div>
                            <div className="grid-2" style={{ gap: 12 }}>
                                <div className="form-group"><label className="form-label">Role</label>
                                    <select className="select" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                                        <option value="agent">Agent</option>
                                        <option value="admin">Admin</option>
                                        <option value="developer">Developer</option>
                                        <option value="ceo">CEO</option>
                                    </select>
                                </div>
                                <div className="form-group"><label className="form-label">Region</label>
                                    <select className="select" value={form.region} onChange={e => setForm(f => ({ ...f, region: e.target.value }))}>{REGIONS.map(r => <option key={r}>{r}</option>)}</select>
                                </div>
                            </div>
                            <div className="form-group"><label className="form-label">LinkedIn URL (optional)</label><input className="input" value={form.linkedin_url} onChange={e => setForm(f => ({ ...f, linkedin_url: e.target.value }))} placeholder="https://linkedin.com/in/…" /></div>
                            <div className="form-group"><label className="form-label">Password (optional — auto-generated if blank)</label><input className="input" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Leave blank to auto-generate" /></div>
                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                                <button className="btn btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
                                <button className="btn btn-primary" onClick={handleCreate} disabled={creating}>{creating ? 'Adding…' : 'Add Employee'}</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Credential reveal modal (after create / reset) */}
            {credential && (
                <div className="modal-overlay" onClick={() => setCredential(null)}>
                    <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                            <h3>🔑 Login Credentials</h3>
                            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setCredential(null)}><X size={16} /></button>
                        </div>
                        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 14 }}>
                            Share these with the employee securely. The password is shown <b>only once</b>.
                        </div>
                        {[{ label: 'Email', value: credential.email }, { label: 'Password', value: credential.password }].map(f => (
                            <div key={f.label} style={{ marginBottom: 10 }}>
                                <div className="form-label">{f.label}</div>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <input className="input" readOnly value={f.value} style={{ fontFamily: 'monospace' }} />
                                    <button className="btn btn-secondary btn-icon" onClick={() => copy(f.value)}><Copy size={14} /></button>
                                </div>
                            </div>
                        ))}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                            <button className="btn btn-primary" onClick={() => setCredential(null)}>Done</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
