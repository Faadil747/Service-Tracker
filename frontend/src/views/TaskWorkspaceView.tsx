import React, { useEffect, useState } from 'react';
import {
    Sparkles, RefreshCw, CheckCircle, Eye, FileText, Plus, X, Play, Pause, Trash2
} from 'lucide-react';
import { tasksApi, postsApi, aiApi, metricsApi, usersApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { Task, Post, KanbanBoard, User } from '../types';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';

const POST_TYPES = ['general', 'job_posting', 'jd_post', 'industry_tip', 'ai_carousel', 'resume_advice'];
const TONES = ['professional', 'casual', 'enthusiastic', 'informative', 'inspirational'];
const EMOJIS = ['🚀', '💡', '✅', '🌟', '🎯', '📊', '💼', '🤝', '🔥', '👋'];

// ── LinkedIn Post Preview ──────────────────────────────────────────────────
const LinkedInPreview: React.FC<{ content: string; hashtags: string }> = ({ content, hashtags }) => {
    const tags = hashtags ? hashtags.split(' ').filter(Boolean) : [];
    return (
        <div className="linkedin-preview">
            <div className="linkedin-preview-header">linkedin.com · Preview Mode</div>
            <div style={{ padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                    <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'var(--accent-glow)', border: '1px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', fontWeight: 700, color: 'var(--accent)' }}>G</div>
                    <div>
                        <div style={{ color: '#191919', fontSize: '0.85rem', fontWeight: 600 }}>GOrecruitAI</div>
                        <div style={{ color: '#666666', fontSize: '0.72rem' }}>Company · Just now</div>
                    </div>
                </div>
                <div className="linkedin-post-card">
                    <div className="linkedin-post-content">
                        {content || <span style={{ color: '#8b9dc3', fontStyle: 'italic' }}>Your post preview will appear here...</span>}
                    </div>
                    {tags.length > 0 && (
                        <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {tags.map(t => <span key={t} style={{ color: '#70b5f9', fontSize: '0.8rem' }}>{t.startsWith('#') ? t : `#${t}`}</span>)}
                        </div>
                    )}
                </div>
                <div style={{ display: 'flex', gap: 16, padding: '10px 4px', borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: 10 }}>
                    {['👍 Like', '💬 Comment', '🔁 Repost', '📤 Send'].map(a => (
                        <span key={a} style={{ color: '#8b9dc3', fontSize: '0.75rem', cursor: 'pointer' }}>{a}</span>
                    ))}
                </div>
            </div>
        </div>
    );
};

// ── Kanban Board ───────────────────────────────────────────────────────────
const KanbanBoardView: React.FC<{ board: KanbanBoard; onRefresh: () => void }> = ({ board, onRefresh }) => {
    const COLUMNS: { key: keyof KanbanBoard; label: string; color: string }[] = [
        { key: 'draft', label: '📝 Draft', color: 'var(--text-muted)' },
        { key: 'in_review', label: '🔍 In Review', color: 'var(--warning)' },
        { key: 'approved', label: '✅ Approved', color: 'var(--success)' },
        { key: 'scheduled', label: '📅 Scheduled', color: 'var(--accent)' },
    ];

    const movePost = async (postId: string, newStatus: string) => {
        try {
            await postsApi.moveKanban(postId, newStatus);
            toast.success('Post moved!');
            onRefresh();
        } catch { toast.error('Failed to move post'); }
    };

    return (
        <div className="kanban-board">
            {COLUMNS.map(col => (
                <div key={col.key} className="kanban-col">
                    <div className="kanban-col-header" style={{ color: col.color }}>
                        {col.label}
                        <span className="badge badge-muted" style={{ marginLeft: 'auto' }}>{board[col.key]?.length || 0}</span>
                    </div>
                    {(board[col.key] || []).map(post => (
                        <div key={post.id} className="kanban-card">
                            <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: 6 }} className="truncate">{post.title || post.content.slice(0, 60) + '...'}</div>
                            <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                                <span className="badge badge-muted">{post.region}</span>
                                <span className="badge badge-muted">{post.post_type.replace('_', ' ')}</span>
                            </div>
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                {COLUMNS.filter(c => c.key !== col.key).map(c => (
                                    <button key={c.key} className="btn btn-ghost" style={{ fontSize: '0.65rem', padding: '3px 8px' }} onClick={() => movePost(post.id, c.key)}>
                                        → {c.key}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                    {(board[col.key]?.length || 0) === 0 && (
                        <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', borderRadius: 8, border: '2px dashed var(--border)' }}>
                            Drop posts here
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
};

// ── Main Workspace ─────────────────────────────────────────────────────────
export const TaskWorkspaceView: React.FC<{ region: string }> = ({ region }) => {
    const { user } = useAuthStore();
    const isAdmin = user?.role === 'admin';
    const [tasks, setTasks] = useState<Task[]>([]);
    const [board, setBoard] = useState<KanbanBoard>({ draft: [], in_review: [], approved: [], scheduled: [] });
    const [templates, setTemplates] = useState<Post[]>([]);
    const [heatmap, setHeatmap] = useState<any[]>([]);
    const [pendingTasks, setPendingTasks] = useState<any[]>([]);
    const [tab, setTab] = useState<'tasks' | 'composer' | 'kanban' | 'library'>('tasks');

    const [searchParams] = useSearchParams();
    const taskIdParam = searchParams.get('taskId');
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
    const [agents, setAgents] = useState<User[]>([]);
    const [showAddTask, setShowAddTask] = useState(false);
    const [newTask, setNewTask] = useState({ title: '', description: '', due_date: '', assigned_to_id: '' });

    // AI Composer state
    const [prompt, setPrompt] = useState('');
    const [postType, setPostType] = useState('general');
    const [tone, setTone] = useState('professional');
    const [hashtags, setHashtags] = useState('');
    const [generatedContent, setGeneratedContent] = useState('');
    const [generatingAI, setGeneratingAI] = useState(false);
    const [previewContent, setPreviewContent] = useState('');
    const [scheduledAt, setScheduledAt] = useState('');
    const [predictedReach, setPredictedReach] = useState<any>(null);
    const [savingPost, setSavingPost] = useState(false);

    // Task completion
    const [completingTask, setCompletingTask] = useState<string | null>(null);

    useEffect(() => { loadAll(); }, [region]);
    useEffect(() => { setPreviewContent(generatedContent); }, [generatedContent]);

    useEffect(() => {
        if (taskIdParam) {
            setTab('tasks');
            setSelectedTaskId(taskIdParam);
        }
    }, [taskIdParam]);

    const loadAll = async () => {
        try {
            const [tRes, bRes, tmplRes, hmRes] = await Promise.all([
                tasksApi.list({ region: region === 'Global' ? undefined : region }),
                postsApi.kanban(region === 'Global' ? undefined : region),
                postsApi.list({ is_template: true }),
                metricsApi.bestTime(region === 'Global' ? undefined : region),
            ]);
            setTasks(tRes.data);
            setBoard(bRes.data);
            setTemplates(tmplRes.data);
            setHeatmap(hmRes.data.heatmap);

            if (isAdmin) {
                const [paRes, agRes] = await Promise.all([
                    tasksApi.pendingApprovals(),
                    usersApi.list({ role: 'agent' }),
                ]);
                setPendingTasks(paRes.data);
                setAgents(agRes.data);
            }
        } catch { }
    };

    const handleGenerateAI = async () => {
        setGeneratingAI(true);
        try {
            const res = await aiApi.generatePost({
                prompt,
                post_type: postType,
                tone,
                hashtags: hashtags.split(' ').filter(Boolean),
                region: region === 'Global' ? 'Global' : region,
                add_emojis: true,
            });
            const content = typeof res.data.content === 'string' ? res.data.content : JSON.stringify(res.data.content);
            setGeneratedContent(content);
            toast.success('Content generated!');

            // Get reach prediction
            const reachRes = await aiApi.predictReach({ content, region });
            setPredictedReach(reachRes.data);
        } catch { toast.error('AI generation failed'); }
        setGeneratingAI(false);
    };

    const handlePublishPost = async () => {
        if (!previewContent) { toast.error('No content to publish'); return; }
        setSavingPost(true);
        try {
            await postsApi.create({
                content: previewContent,
                post_type: postType,
                tone,
                hashtags,
                region,
                scheduled_at: scheduledAt || undefined,
                is_template: false,
            });
            toast.success(isAdmin ? 'Post created and approved!' : 'Post submitted for review!');
            setPreviewContent(''); setGeneratedContent(''); setPrompt('');
            loadAll();
        } catch { toast.error('Failed to save post'); }
        setSavingPost(false);
    };

    const handleAddTask = async () => {
        if (!newTask.title.trim()) return toast.error('Task title is required');
        try {
            await tasksApi.create({ ...newTask, region });
            toast.success(isAdmin ? 'Task created!' : 'Task submitted for approval');
            setShowAddTask(false);
            setNewTask({ title: '', description: '', due_date: '', assigned_to_id: '' });
            loadAll();
        } catch { toast.error('Failed to create task'); }
    };

    const handleCompleteTask = async (taskId: string) => {
        setCompletingTask(taskId);
        try {
            await tasksApi.complete(taskId);
            toast.success('Task marked complete!');
            loadAll();
        } catch { toast.error('Failed to complete task'); }
        setCompletingTask(null);
    };

    const handleHoldTask = async (taskId: string) => {
        try {
            await tasksApi.updateStatus(taskId, 'on_hold');
            toast.success('Task put on hold!');
            loadAll();
        } catch { toast.error('Failed to put task on hold'); }
    };

    const handleResumeTask = async (taskId: string) => {
        try {
            await tasksApi.updateStatus(taskId, 'active');
            toast.success('Task resumed!');
            loadAll();
        } catch { toast.error('Failed to resume task'); }
    };

    const handleRemoveTask = async (taskId: string) => {
        if (!window.confirm('Are you sure you want to delete this task?')) return;
        try {
            await tasksApi.delete(taskId);
            toast.success('Task deleted!');
            loadAll();
        } catch { toast.error('Failed to delete task'); }
    };

    const handleApproveTask = async (taskId: string, status: string) => {
        try {
            await tasksApi.approve(taskId, { status, comment: `${status === 'approved' ? 'Approved' : 'Rejected'} by ${user?.full_name}` });
            toast.success(`Task ${status}!`);
            loadAll();
        } catch { toast.error('Action failed'); }
    };

    // Heatmap rendering
    const maxEngagement = Math.max(...heatmap.map(c => c.engagement), 1);
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    const TAB_STYLE = (active: boolean) => ({
        padding: '8px 16px',
        borderRadius: 8,
        cursor: 'pointer',
        border: 'none',
        fontSize: '0.85rem',
        fontWeight: active ? 600 : 400,
        background: active ? 'var(--accent-glow)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--text-secondary)',
        transition: 'all 0.18s',
    });

    return (
        <div className="page-content animate-fade">
            {/* Tabs */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'var(--surface)', padding: 4, borderRadius: 12, width: 'fit-content' }}>
                {[
                    { id: 'tasks', label: '📋 My Tasks' },
                    { id: 'composer', label: '✨ AI Composer' },
                    { id: 'kanban', label: '🗂 Kanban' },
                    { id: 'library', label: '📚 Library' },
                ].map(t => (
                    <button key={t.id} style={TAB_STYLE(tab === t.id)} onClick={() => setTab(t.id as any)}>
                        {t.label}
                    </button>
                ))}
            </div>

            {/* ── Tasks Tab ─────────────────────────────────────────────────── */}
            {tab === 'tasks' && (
                <div>
                    {/* Header Row */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                        <h3 style={{ margin: 0 }}>📋 Task Workspace</h3>
                        <button className="btn btn-primary" onClick={() => setShowAddTask(true)} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Plus size={16} /> Add Task
                        </button>
                    </div>

                    {/* Admin: Pending approvals */}
                    {isAdmin && pendingTasks.length > 0 && (
                        <div className="chart-container" style={{ marginBottom: 20 }}>
                            <div className="chart-title">⏳ Pending Approvals ({pendingTasks.length})</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {pendingTasks.map(t => (
                                    <div key={t.id} className="glass-card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{t.title}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t.description}</div>
                                        </div>
                                        <button className="btn btn-sm" style={{ background: 'rgba(16,185,129,0.15)', color: 'var(--success)', border: '1px solid rgba(16,185,129,0.3)' }} onClick={() => handleApproveTask(t.id, 'approved')}>
                                            ✓ Approve
                                        </button>
                                        <button className="btn btn-sm btn-danger" onClick={() => handleApproveTask(t.id, 'rejected')}>
                                            ✗ Reject
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Active tasks */}
                    {(() => {
                        const activeTasks = tasks.filter(t => ['active', 'in_progress'].includes(t.status));
                        const onHoldTasks = tasks.filter(t => t.status === 'on_hold');
                        const completedTasks = tasks.filter(t => t.status === 'completed');

                        return (
                            <>
                                <div className="chart-container">
                                    <div className="chart-title">📅 Active Tasks ({activeTasks.length})</div>
                                    {activeTasks.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                                            <CheckCircle size={40} style={{ marginBottom: 12, opacity: 0.3 }} />
                                            <p>No active tasks — you're all caught up!</p>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                            {activeTasks.map(t => {
                                                const isSelected = selectedTaskId === t.id;
                                                return (
                                                    <div
                                                        key={t.id}
                                                        className="glass-card glass-card-hover"
                                                        style={{
                                                            padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: 12,
                                                            border: isSelected ? '2px solid var(--accent)' : undefined,
                                                            boxShadow: isSelected ? '0 0 12px rgba(37,99,235,0.15)' : undefined
                                                        }}
                                                    >
                                                        <div className={`status-dot dot-active`} style={{ marginTop: 4 }} />
                                                        <div style={{ flex: 1 }}>
                                                            <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: 4 }}>{t.title}</div>
                                                            {t.description && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 6 }}>{t.description}</div>}
                                                            <div style={{ display: 'flex', gap: 6 }}>
                                                                <span className="badge badge-muted">{t.region}</span>
                                                                {t.due_date && <span className={`badge ${new Date(t.due_date) < new Date() ? 'badge-danger' : 'badge-accent'}`}>Due: {new Date(t.due_date).toLocaleDateString()}</span>}
                                                            </div>
                                                        </div>
                                                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                                            <button
                                                                className="btn btn-sm btn-primary"
                                                                disabled={completingTask === t.id}
                                                                onClick={() => handleCompleteTask(t.id)}
                                                                style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                                                            >
                                                                {completingTask === t.id ? '...' : <><CheckCircle size={13} /> Complete</>}
                                                            </button>
                                                            <button
                                                                className="btn btn-sm btn-secondary"
                                                                onClick={() => handleHoldTask(t.id)}
                                                                style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                                                            >
                                                                <Pause size={13} /> Hold
                                                            </button>
                                                            <button
                                                                className="btn btn-sm btn-ghost"
                                                                style={{ color: 'var(--danger)', padding: 6 }}
                                                                onClick={() => handleRemoveTask(t.id)}
                                                                title="Delete Task"
                                                            >
                                                                <Trash2 size={15} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                {/* On Hold Tasks */}
                                <div className="chart-container" style={{ marginTop: 20 }}>
                                    <div className="chart-title">⏸ On Hold Tasks ({onHoldTasks.length})</div>
                                    {onHoldTasks.length === 0 ? (
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', padding: '15px 0' }}>
                                            No tasks currently on hold
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                            {onHoldTasks.map(t => {
                                                const isSelected = selectedTaskId === t.id;
                                                return (
                                                    <div
                                                        key={t.id}
                                                        className="glass-card"
                                                        style={{
                                                            padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: 12, opacity: 0.85,
                                                            border: isSelected ? '2px solid var(--accent)' : undefined,
                                                            boxShadow: isSelected ? '0 0 12px rgba(37,99,235,0.15)' : undefined
                                                        }}
                                                    >
                                                        <div className="status-dot dot-draft" style={{ marginTop: 4 }} />
                                                        <div style={{ flex: 1 }}>
                                                            <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: 4, color: 'var(--text-secondary)' }}>{t.title}</div>
                                                            {t.description && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 6 }}>{t.description}</div>}
                                                            <div style={{ display: 'flex', gap: 6 }}>
                                                                <span className="badge badge-muted">{t.region}</span>
                                                                {t.due_date && <span className="badge badge-muted">Due: {new Date(t.due_date).toLocaleDateString()}</span>}
                                                            </div>
                                                        </div>
                                                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                                            <button
                                                                className="btn btn-sm btn-secondary"
                                                                onClick={() => handleResumeTask(t.id)}
                                                                style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                                                            >
                                                                <Play size={13} /> Resume
                                                            </button>
                                                            <button
                                                                className="btn btn-sm btn-ghost"
                                                                style={{ color: 'var(--danger)', padding: 6 }}
                                                                onClick={() => handleRemoveTask(t.id)}
                                                                title="Delete Task"
                                                            >
                                                                <Trash2 size={15} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                {/* Completed Tasks */}
                                <div className="chart-container" style={{ marginTop: 20 }}>
                                    <div className="chart-title">✅ Completed Tasks ({completedTasks.length})</div>
                                    {completedTasks.length === 0 ? (
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', padding: '15px 0' }}>
                                            No completed tasks yet
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                            {completedTasks.map(t => {
                                                const isSelected = selectedTaskId === t.id;
                                                return (
                                                    <div
                                                        key={t.id}
                                                        className="glass-card"
                                                        style={{
                                                            padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: 12, opacity: 0.7,
                                                            border: isSelected ? '2px solid var(--accent)' : undefined,
                                                            boxShadow: isSelected ? '0 0 12px rgba(37,99,235,0.15)' : undefined
                                                        }}
                                                    >
                                                        <div className="status-dot dot-completed" style={{ marginTop: 4 }} />
                                                        <div style={{ flex: 1 }}>
                                                            <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: 4, textDecoration: 'line-through' }}>{t.title}</div>
                                                            {t.description && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 6 }}>{t.description}</div>}
                                                            <div style={{ display: 'flex', gap: 6 }}>
                                                                <span className="badge badge-muted">{t.region}</span>
                                                                {t.due_date && <span className="badge badge-muted">Due: {new Date(t.due_date).toLocaleDateString()}</span>}
                                                            </div>
                                                        </div>
                                                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                                            <button
                                                                className="btn btn-sm btn-ghost"
                                                                style={{ color: 'var(--danger)', padding: 6 }}
                                                                onClick={() => handleRemoveTask(t.id)}
                                                                title="Delete Task"
                                                            >
                                                                <Trash2 size={15} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </>
                        );
                    })()}

                    {/* Add Task Modal */}
                    {showAddTask && (
                        <div className="modal-overlay" onClick={() => setShowAddTask(false)}>
                            <div className="modal-box" onClick={e => e.stopPropagation()}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                                    <h4 style={{ margin: 0 }}>➕ Add New Task</h4>
                                    <button className="btn btn-ghost btn-sm" onClick={() => setShowAddTask(false)} style={{ padding: 4 }}><X size={16} /></button>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                                    <div>
                                        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>TASK TITLE *</label>
                                        <input className="input" placeholder="e.g. Write LinkedIn post for hiring React dev" value={newTask.title} onChange={e => setNewTask(p => ({ ...p, title: e.target.value }))} />
                                    </div>

                                    <div>
                                        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>DESCRIPTION</label>
                                        <textarea className="textarea" placeholder="Provide extra details for this task..." value={newTask.description} onChange={e => setNewTask(p => ({ ...p, description: e.target.value }))} style={{ minHeight: 80 }} />
                                    </div>

                                    <div className="grid-2">
                                        <div>
                                            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>DUE DATE</label>
                                            <input className="input" type="datetime-local" value={newTask.due_date} onChange={e => setNewTask(p => ({ ...p, due_date: e.target.value }))} />
                                        </div>

                                        {isAdmin && (
                                            <div>
                                                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>ASSIGN TO AGENT</label>
                                                <select className="select" value={newTask.assigned_to_id} onChange={e => setNewTask(p => ({ ...p, assigned_to_id: e.target.value }))}>
                                                    <option value="">Unassigned (Self)</option>
                                                    {agents.map(a => (
                                                        <option key={a.id} value={a.id}>{a.full_name} ({a.region})</option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
                                        <button className="btn btn-secondary" onClick={() => setShowAddTask(false)}>Cancel</button>
                                        <button className="btn btn-primary" onClick={handleAddTask}>
                                            {isAdmin ? 'Create Task' : 'Submit for Approval'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ── AI Composer Tab ───────────────────────────────────────────── */}
            {tab === 'composer' && (
                <div>
                    <div className="split-pane">
                        {/* Left: Prompt + Controls */}
                        <div className="composer-pane">
                            <h4 style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}><Sparkles size={16} color="var(--accent)" /> AI Post Composer</h4>

                            <div style={{ marginBottom: 12 }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>POST TYPE</label>
                                <select className="select" value={postType} onChange={e => setPostType(e.target.value)}>
                                    {POST_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ').toUpperCase()}</option>)}
                                </select>
                            </div>

                            <div style={{ marginBottom: 12 }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>TONE</label>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                    {TONES.map(t => (
                                        <button key={t} className="btn btn-sm" onClick={() => setTone(t)} style={{ background: tone === t ? 'var(--accent-glow)' : 'var(--surface)', color: tone === t ? 'var(--accent)' : 'var(--text-secondary)', border: `1px solid ${tone === t ? 'var(--accent)' : 'var(--border)'}` }}>
                                            {t}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div style={{ marginBottom: 12 }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>HASHTAGS</label>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                                    {['#Hiring', '#GOrecruitAI', '#HRTech', '#Jobs', '#AIRecruitment'].map(h => (
                                        <button key={h} className="btn btn-sm btn-ghost" onClick={() => setHashtags(p => p.includes(h) ? p.replace(h, '').trim() : `${p} ${h}`.trim())} style={{ fontSize: '0.72rem', padding: '3px 10px', background: hashtags.includes(h) ? 'var(--accent-glow)' : undefined, color: hashtags.includes(h) ? 'var(--accent)' : undefined }}>
                                            {h}
                                        </button>
                                    ))}
                                </div>
                                <input className="input" placeholder="Add custom hashtags..." value={hashtags} onChange={e => setHashtags(e.target.value)} />
                            </div>

                            {/* Emojis */}
                            <div style={{ marginBottom: 16 }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>QUICK EMOJIS</label>
                                <div style={{ display: 'flex', gap: 6 }}>
                                    {EMOJIS.map(e => <button key={e} className="btn btn-sm btn-ghost" onClick={() => setPrompt(p => p + e)} style={{ padding: '4px 8px' }}>{e}</button>)}
                                </div>
                            </div>

                            <div style={{ marginBottom: 16 }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>PROMPT / TOPIC</label>
                                <textarea className="textarea" placeholder="Describe what you want to post about... e.g. 'We're hiring Senior React developers in Bangalore, hybrid work, competitive salary'" value={prompt} onChange={e => setPrompt(e.target.value)} style={{ minHeight: 100 }} />
                            </div>

                            <button className="btn btn-primary w-full" onClick={handleGenerateAI} disabled={generatingAI || !prompt}>
                                {generatingAI ? <><RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> Generating...</> : <><Sparkles size={14} /> Generate with DeepSeek AI</>}
                            </button>

                            {predictedReach && (
                                <div className="glass-card" style={{ marginTop: 12, padding: 12 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>PREDICTED REACH</span>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent)' }}>{predictedReach.predicted_reach?.toLocaleString()}</span>
                                    </div>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Confidence: {predictedReach.confidence}%</div>
                                </div>
                            )}

                            {/* Schedule */}
                            <div style={{ marginTop: 16 }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>SCHEDULE POST</label>
                                <input className="input" type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} />
                            </div>

                            <button className="btn btn-secondary w-full" style={{ marginTop: 12 }} onClick={handlePublishPost} disabled={savingPost || !previewContent}>
                                {savingPost ? 'Saving...' : isAdmin ? '📤 Save & Approve' : '📤 Submit for Review'}
                            </button>
                        </div>

                        {/* Right: Live Preview */}
                        <div className="composer-pane" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <h4 style={{ marginBottom: 0, display: 'flex', alignItems: 'center', gap: 8 }}><Eye size={16} color="var(--purple)" /> Live Preview</h4>

                            {generatedContent && (
                                <div style={{ marginBottom: 8 }}>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>EDIT CONTENT</label>
                                    <textarea className="textarea" value={previewContent} onChange={e => setPreviewContent(e.target.value)} style={{ minHeight: 140 }} />
                                </div>
                            )}

                            <LinkedInPreview content={previewContent} hashtags={hashtags} />

                            {/* Best time heatmap preview */}
                            {heatmap.length > 0 && (
                                <div className="chart-container">
                                    <div className="chart-title">⏰ Best Time to Post ({region})</div>
                                    <div style={{ overflowX: 'auto' }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: `32px repeat(24, 1fr)`, gap: 2, minWidth: 500 }}>
                                            <div />
                                            {Array.from({ length: 24 }, (_, h) => (
                                                <div key={h} style={{ fontSize: '0.6rem', textAlign: 'center', color: 'var(--text-muted)' }}>{h}</div>
                                            ))}
                                            {days.map(day => (
                                                <React.Fragment key={day}>
                                                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>{day}</div>
                                                    {Array.from({ length: 24 }, (_, h) => {
                                                        const cell = heatmap.find(c => c.day === day && c.hour === h);
                                                        const intensity = cell ? cell.engagement / maxEngagement : 0;
                                                        return (
                                                            <div key={h} className="heatmap-cell" title={`${day} ${h}:00 — ${cell?.engagement || 0} engagement`} style={{ background: `rgba(0, 198, 167, ${intensity * 0.9 + 0.05})`, aspectRatio: '1' }} />
                                                        );
                                                    })}
                                                </React.Fragment>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Kanban Tab ────────────────────────────────────────────────── */}
            {tab === 'kanban' && (
                <div>
                    <div style={{ marginBottom: 16 }}>
                        <h4>Approval Pipeline</h4>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Drag posts through the review process</p>
                    </div>
                    <KanbanBoardView board={board} onRefresh={loadAll} />
                </div>
            )}

            {/* ── Library Tab ───────────────────────────────────────────────── */}
            {tab === 'library' && (
                <div>
                    <div style={{ marginBottom: 16 }}>
                        <h4>📚 Post Templates & Library</h4>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Reuse successful posts as templates for new content</p>
                    </div>
                    {templates.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
                            <FileText size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
                            <p>No templates yet. Save a post as a template from the composer.</p>
                        </div>
                    ) : (
                        <div className="grid-auto">
                            {templates.map(p => (
                                <div key={p.id} className="glass-card glass-card-hover" style={{ padding: 16, cursor: 'pointer' }} onClick={() => {
                                    setPreviewContent(p.content);
                                    setGeneratedContent(p.content);
                                    setHashtags(p.hashtags);
                                    setPostType(p.post_type);
                                    setTone(p.tone);
                                    setTab('composer');
                                }}>
                                    <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                                        <span className="badge badge-muted">{p.post_type.replace('_', ' ')}</span>
                                        <span className="badge badge-accent">{p.region}</span>
                                    </div>
                                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }} className="truncate">
                                        {p.content.slice(0, 120)}...
                                    </p>
                                    <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{p.predicted_reach.toLocaleString()} predicted reach</span>
                                        <button className="btn btn-sm btn-ghost">Use Template →</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
