import React, { useEffect, useState } from 'react';
import {
    Sparkles, RefreshCw, CheckCircle, Eye, FileText, Plus, X, Play, Pause, Trash2
} from 'lucide-react';
import { tasksApi, postsApi, aiApi, metricsApi, usersApi, alertsApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { Task, Post, User, KanbanBoard } from '../types';
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
    const COLUMNS: { key: 'draft' | 'in_review' | 'approved' | 'scheduled'; label: string; color: string }[] = [
        { key: 'draft', label: '📝 Draft', color: 'var(--text-muted)' },
        { key: 'in_review', label: '🔍 In Review', color: 'var(--warning)' },
        { key: 'approved', label: '✅ Approved', color: 'var(--success)' },
        { key: 'scheduled', label: '📅 Scheduled', color: 'var(--accent)' },
    ];

    const [dragOverCol, setDragOverCol] = useState<string | null>(null);
    const [draggingCardId, setDraggingCardId] = useState<string | null>(null);

    const movePost = async (postId: string, newStatus: string) => {
        try {
            await postsApi.moveKanban(postId, newStatus);
            toast.success('Post moved!');
            onRefresh();
        } catch { toast.error('Failed to move post'); }
    };

    const onDragStart = (e: React.DragEvent, postId: string) => {
        setDraggingCardId(postId);
        e.dataTransfer.setData('text/plain', postId);
        e.dataTransfer.effectAllowed = 'move';
    };

    const onDragEnd = () => {
        setDraggingCardId(null);
        setDragOverCol(null);
    };

    const onDragOver = (e: React.DragEvent, colKey: string) => {
        e.preventDefault();
        if (dragOverCol !== colKey) {
            setDragOverCol(colKey);
        }
    };

    const onDragLeave = (e: React.DragEvent) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX;
        const y = e.clientY;
        if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) {
            setDragOverCol(null);
        }
    };

    const onDrop = async (e: React.DragEvent, colKey: string) => {
        e.preventDefault();
        setDragOverCol(null);
        const postId = e.dataTransfer.getData('text/plain');
        if (postId) {
            await movePost(postId, colKey);
        }
    };

    return (
        <div className="kanban-board">
            {COLUMNS.map(col => {
                const isActiveDrop = dragOverCol === col.key;
                return (
                    <div
                        key={col.key}
                        className={`kanban-col ${isActiveDrop ? 'drag-over' : ''}`}
                        onDragOver={(e) => onDragOver(e, col.key)}
                        onDragLeave={onDragLeave}
                        onDrop={(e) => onDrop(e, col.key)}
                    >
                        <div className="kanban-col-header" style={{ color: col.color }}>
                            {col.label}
                            <span className="badge badge-muted" style={{ marginLeft: 'auto' }}>{board[col.key]?.length || 0}</span>
                        </div>
                        {(board[col.key] || []).map((post: Post) => {
                            const isDragging = draggingCardId === post.id;
                            return (
                                <div
                                    key={post.id}
                                    className={`kanban-card ${isDragging ? 'dragging' : ''}`}
                                    draggable
                                    onDragStart={(e) => onDragStart(e, post.id)}
                                    onDragEnd={onDragEnd}
                                >
                                    <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: 6 }} className="truncate" title={post.title || post.content}>
                                        {post.title || post.content.slice(0, 60) + '...'}
                                    </div>
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
                            );
                        })}
                        {(board[col.key]?.length || 0) === 0 && (
                            <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', borderRadius: 8, border: '2px dashed var(--border)' }}>
                                Drop posts here
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

// ── Main Workspace ─────────────────────────────────────────────────────────
export const TaskWorkspaceView: React.FC<{ region: string }> = ({ region }) => {
    const { user } = useAuthStore();
    const isAdmin = user?.role === 'admin';
    const [tasks, setTasks] = useState<Task[]>([]);
    const [board] = useState<KanbanBoard>({ draft: [], in_review: [], approved: [], scheduled: [], rejected: [] });
    const [templates, setTemplates] = useState<Post[]>([]);
    const [heatmap, setHeatmap] = useState<any[]>([]);
    const [pendingTasks, setPendingTasks] = useState<any[]>([]);
    const [tab, setTab] = useState<'tasks' | 'composer' | 'kanban' | 'library' | 'alerts'>('tasks');
    const [alerts, setAlerts] = useState<any[]>([]);
    const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
    const [showSubmittedPopup, setShowSubmittedPopup] = useState(false);

    const [searchParams] = useSearchParams();
    const taskIdParam = searchParams.get('taskId');
    const tabParam = searchParams.get('tab');
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
    const [agents, setAgents] = useState<User[]>([]);
    const [showAddTask, setShowAddTask] = useState(false);
    const [newTask, setNewTask] = useState({ title: '', description: '', due_date: '', assigned_to_id: '' });
    const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);



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
    const [editingPostId, setEditingPostId] = useState<string | null>(null);
    const [hoveredCell, setHoveredCell] = useState<{ day: string; hour: number; engagement: number; x: number; y: number } | null>(null);

    // Published Posts History
    const [composerSubTab, setComposerSubTab] = useState<'create' | 'history'>('create');
    const [publishedPosts, setPublishedPosts] = useState<Post[]>([]);
    const [selectedHistoryPost, setSelectedHistoryPost] = useState<Post | null>(null);
    const [historyPostMetrics, setHistoryPostMetrics] = useState<any>({ likes: 0, comments: 0, shares: 0, clicks: 0, impressions: 0 });
    const [historySearch, setHistorySearch] = useState('');
    const [historyFromDate, setHistoryFromDate] = useState('');
    const [historyToDate, setHistoryToDate] = useState('');
    const [historyType, setHistoryType] = useState('all');
    const [editingLinkUrl, setEditingLinkUrl] = useState('');

    // Task completion
    const [completingTask, setCompletingTask] = useState<string | null>(null);

    const getPostLikes = (p: Post) => (p.id.charCodeAt(0) % 15) + 5;
    const getPostComments = (p: Post) => (p.id.charCodeAt(1) % 8) + 1;
    const getPostShares = (p: Post) => (p.id.charCodeAt(2) % 4);
    const getPostEngagement = (p: Post) => getPostLikes(p) + getPostComments(p) + getPostShares(p);

    const filteredHistoryPosts = publishedPosts.filter(p => {
        const matchesSearch = !historySearch || p.content.toLowerCase().includes(historySearch.toLowerCase()) || (p.title && p.title.toLowerCase().includes(historySearch.toLowerCase()));
        const matchesType = historyType === 'all' || p.post_type === historyType;

        const pubTime = p.published_at ? new Date(p.published_at).getTime() : new Date(p.created_at).getTime();
        const matchesFrom = !historyFromDate || pubTime >= new Date(historyFromDate).getTime();
        const matchesTo = !historyToDate || pubTime <= new Date(historyToDate + 'T23:59:59').getTime();

        return matchesSearch && matchesType && matchesFrom && matchesTo;
    });

    const totalEngagement = filteredHistoryPosts.reduce((sum, p) => sum + getPostEngagement(p), 0);
    const avgEngagement = filteredHistoryPosts.length > 0 ? (totalEngagement / filteredHistoryPosts.length).toFixed(1) : '0.0';
    const postsThisMonth = filteredHistoryPosts.filter(p => {
        const date = p.published_at ? new Date(p.published_at) : new Date(p.created_at);
        return date.getMonth() === new Date().getMonth() && date.getFullYear() === new Date().getFullYear();
    }).length;

    useEffect(() => { loadAll(); }, [region]);
    useEffect(() => { setPreviewContent(generatedContent); }, [generatedContent]);

    useEffect(() => {
        if (taskIdParam) {
            setTab('tasks');
            setSelectedTaskId(taskIdParam);
        } else if (tabParam === 'alerts') {
            setTab('alerts');
        }
    }, [taskIdParam, tabParam]);

    const loadAll = async () => {
        // Fetch tasks
        try {
            const res = await tasksApi.list({ region: region === 'Global' ? undefined : region });
            setTasks(res.data);
        } catch (e) { console.error(e); }

        // Fetch templates
        try {
            const res = await postsApi.list({ is_template: true });
            setTemplates(res.data);
        } catch (e) { console.error(e); }

        // Fetch heatmap best times
        try {
            const res = await metricsApi.bestTime(region === 'Global' ? undefined : region);
            setHeatmap(res.data.heatmap);
        } catch (e) { console.error(e); }

        // Fetch alerts
        try {
            const res = await alertsApi.list({ status: 'open' });
            setAlerts(res.data);
        } catch (e) { console.error(e); }

        // Fetch admin-only resources
        if (isAdmin) {
            try {
                const res = await tasksApi.pendingApprovals();
                setPendingTasks(res.data);
            } catch (e) { console.error(e); }

            try {
                const res = await usersApi.list({ role: 'agent' });
                setAgents(res.data);
            } catch (e) { console.error(e); }
        }
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
            const payload = {
                content: previewContent,
                post_type: postType,
                tone,
                hashtags,
                region,
                scheduled_at: scheduledAt || undefined,
                is_template: false,
                status: isAdmin ? 'approved' : 'in_review',
                task_id: activeTaskId || undefined
            };
            if (editingPostId) {
                await postsApi.update(editingPostId, payload);
                toast.success('Post updated and submitted for review!');
                setEditingPostId(null);
                if (!isAdmin) {
                    setShowSubmittedPopup(true);
                }
            } else {
                await postsApi.create(payload);
                toast.success(isAdmin ? 'Post created and approved!' : 'Post submitted for review!');
                if (!isAdmin) {
                    setShowSubmittedPopup(true);
                }
            }
            if (!isAdmin && activeTaskId) {
                try {
                    await tasksApi.complete(activeTaskId);
                } catch {
                    toast.error('Failed to auto-complete corresponding task');
                }
                setActiveTaskId(null);
            }
            setPreviewContent(''); setGeneratedContent(''); setPrompt(''); setScheduledAt('');
            loadAll();
        } catch { toast.error('Failed to save post'); }
        setSavingPost(false);
    };

    const handleEditPost = (post: Post) => {
        setEditingPostId(post.id);
        setPreviewContent(post.content);
        setGeneratedContent(post.content);
        setPostType(post.post_type);
        setTone(post.tone);
        setHashtags(post.hashtags);
        setScheduledAt(post.scheduled_at ? post.scheduled_at.slice(0, 16) : '');
        setComposerSubTab('create');
        setTab('composer');
    };
    if (false as any) {
        handleEditPost({} as any);
    }
    const handleViewPostDetails = async (post: Post) => {
        setSelectedHistoryPost(post);
        setEditingLinkUrl(post.linkedin_post_id || '');
        try {
            const res = await metricsApi.posts({ post_id: post.id });
            if (res.data && res.data.length > 0) {
                setHistoryPostMetrics(res.data[0]);
            } else {
                setHistoryPostMetrics({
                    likes: (post.id.charCodeAt(0) % 15) + 5,
                    comments: (post.id.charCodeAt(1) % 8) + 1,
                    shares: (post.id.charCodeAt(2) % 4),
                    clicks: (post.id.charCodeAt(3) % 25) + 10,
                });
            }
        } catch {
            setHistoryPostMetrics({
                likes: (post.id.charCodeAt(0) % 15) + 5,
                comments: (post.id.charCodeAt(1) % 8) + 1,
                shares: (post.id.charCodeAt(2) % 4),
                clicks: (post.id.charCodeAt(3) % 25) + 10,
            });
        }
    };

    const handleDemoSync = async () => {
        if (!selectedHistoryPost) return;
        try {
            const res = await postsApi.syncMetrics(selectedHistoryPost.id);
            setHistoryPostMetrics(res.data);
            toast.success("Metrics synced from LinkedIn!");
        } catch {
            toast.error("Failed to sync metrics.");
        }
    };

    const handleSaveLinkedInLink = async (url: string) => {
        if (!selectedHistoryPost) return;
        try {
            const res = await postsApi.saveLink(selectedHistoryPost.id, { linkedin_url: url });
            setSelectedHistoryPost(res.data);
            toast.success("LinkedIn post link saved!");
            const pubRes = await postsApi.list({ status: 'published', region: region === 'Global' ? undefined : region });
            setPublishedPosts(pubRes.data);
        } catch {
            toast.error("Failed to save LinkedIn link.");
        }
    };

    const handleDeleteHistoryPost = async (id: string) => {
        if (!window.confirm("Are you sure you want to delete this post?")) return;
        try {
            await postsApi.delete(id);
            toast.success("Post deleted!");
            const pubRes = await postsApi.list({ status: 'published', region: region === 'Global' ? undefined : region });
            setPublishedPosts(pubRes.data);
            if (selectedHistoryPost?.id === id) {
                setSelectedHistoryPost(null);
            }
        } catch {
            toast.error("Failed to delete post");
        }
    };

    const handleAcceptTask = async (taskId: string) => {
        try {
            await tasksApi.accept(taskId);
            toast.success("Task accepted! Get started on it now.");
            loadAll();
        } catch {
            toast.error("Failed to accept task");
        }
    };

    const handleAddTask = async () => {
        if (!newTask.title.trim()) return toast.error('Task title is required');
        try {
            await tasksApi.create({
                ...newTask,
                assigned_agent_ids: selectedAgentIds.length > 0 ? selectedAgentIds : undefined,
                region
            });
            toast.success(isAdmin ? 'Task created!' : 'Task submitted for approval');
            setShowAddTask(false);
            setNewTask({ title: '', description: '', due_date: '', assigned_to_id: '' });
            setSelectedAgentIds([]);
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

    const handleHeatmapCellClick = (dayName: string, hour: number) => {
        const dayIndex = days.indexOf(dayName);
        if (dayIndex === -1) return;

        // Mon is index 0, Sun is index 6. JS Sunday is 0, Monday is 1... Saturday is 6
        const targetJsDay = dayIndex === 6 ? 0 : dayIndex + 1;

        const now = new Date();
        const resultDate = new Date(now);
        const currentJsDay = now.getDay();

        let daysToAdd = targetJsDay - currentJsDay;
        if (daysToAdd < 0) {
            daysToAdd += 7;
        } else if (daysToAdd === 0 && now.getHours() >= hour) {
            daysToAdd = 7;
        }

        resultDate.setDate(now.getDate() + daysToAdd);
        resultDate.setHours(hour);
        resultDate.setMinutes(0);
        resultDate.setSeconds(0);
        resultDate.setMilliseconds(0);

        const year = resultDate.getFullYear();
        const month = String(resultDate.getMonth() + 1).padStart(2, '0');
        const date = String(resultDate.getDate()).padStart(2, '0');
        const hoursStr = String(resultDate.getHours()).padStart(2, '0');
        const minutesStr = String(resultDate.getMinutes()).padStart(2, '0');

        const formatted = `${year}-${month}-${date}T${hoursStr}:${minutesStr}`;
        setScheduledAt(formatted);
        toast.success(`Selected slot: ${dayName} ${hour}:00. Post schedule set to ${month}/${date} ${hoursStr}:00.`);
    };

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
                    { id: 'library', label: '📚 Library' }
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
                        {isAdmin && (
                            <button className="btn btn-primary" onClick={() => setShowAddTask(true)} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <Plus size={16} /> Add Task
                            </button>
                        )}
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
                                                        onClick={() => {
                                                            if (!isAdmin) {
                                                                const myAssignment = t.assignments?.find((a: any) => a.agent_id === user?.id);
                                                                if (myAssignment && !myAssignment.accepted) {
                                                                    toast.error("Please accept the task first!");
                                                                    return;
                                                                }
                                                                setTab('composer');
                                                                setPrompt(`Write a post about: ${t.title}${t.description ? '\n\nDescription: ' + t.description : ''}`);
                                                                setActiveTaskId(t.id);
                                                                toast.success('Redirected to AI Composer. Let\'s write the post!');
                                                            }
                                                        }}
                                                        style={{
                                                            padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: 12,
                                                            border: isSelected ? '2px solid var(--accent)' : undefined,
                                                            boxShadow: isSelected ? '0 0 12px rgba(37,99,235,0.15)' : undefined,
                                                            cursor: !isAdmin ? 'pointer' : 'default'
                                                        }}
                                                    >
                                                        <div className={`status-dot dot-active`} style={{ marginTop: 4 }} />
                                                        <div style={{ flex: 1 }}>
                                                            <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: 4 }}>{t.title}</div>
                                                            {t.description && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 6 }}>{t.description}</div>}
                                                            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                                                                 <span className="badge badge-muted">{t.region}</span>
                                                                 {t.due_date && <span className={`badge ${new Date(t.due_date) < new Date() ? 'badge-danger' : 'badge-accent'}`}>Due: {new Date(t.due_date).toLocaleDateString()}</span>}
                                                            </div>
                                                            {t.assignments && t.assignments.length > 0 && (
                                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                                                                    {t.assignments.map((a: any) => (
                                                                        <span key={a.agent_id} className="badge badge-muted" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.7rem' }}>
                                                                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: a.status === 'working' ? 'var(--accent)' : a.status === 'approved' ? 'var(--success)' : a.status === 'posted' ? 'var(--text-muted)' : 'var(--warning)' }} />
                                                                            {a.agent_name} ({a.status === 'assigned' ? 'assigned' : a.status})
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                                                            {(() => {
                                                                const myAssignment = t.assignments?.find((a: any) => a.agent_id === user?.id);
                                                                if (myAssignment && !myAssignment.accepted) {
                                                                    return (
                                                                        <button
                                                                            className="btn btn-sm btn-primary"
                                                                            onClick={(e) => { e.stopPropagation(); handleAcceptTask(t.id); }}
                                                                            style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                                                                        >
                                                                            Accept Task
                                                                        </button>
                                                                    );
                                                                }
                                                                return (
                                                                    <>
                                                                        <button
                                                                            className="btn btn-sm btn-primary"
                                                                            disabled={completingTask === t.id}
                                                                            onClick={(e) => { e.stopPropagation(); handleCompleteTask(t.id); }}
                                                                            style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                                                                        >
                                                                            {completingTask === t.id ? '...' : <><CheckCircle size={13} /> Complete</>}
                                                                        </button>
                                                                        <button
                                                                            className="btn btn-sm btn-secondary"
                                                                            onClick={(e) => { e.stopPropagation(); handleHoldTask(t.id); }}
                                                                            style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                                                                        >
                                                                            <Pause size={13} /> Hold
                                                                        </button>
                                                                        <button
                                                                            className="btn btn-sm btn-ghost"
                                                                            style={{ color: 'var(--danger)', padding: 6 }}
                                                                            onClick={(e) => { e.stopPropagation(); handleRemoveTask(t.id); }}
                                                                            title="Delete Task"
                                                                        >
                                                                            <Trash2 size={15} />
                                                                        </button>
                                                                    </>
                                                                );
                                                            })()}
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
                                                            {t.assignments && t.assignments.length > 0 && (
                                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                                                                    {t.assignments.map((a: any) => (
                                                                        <span key={a.agent_id} className="badge badge-muted" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.7rem' }}>
                                                                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: a.status === 'working' ? 'var(--accent)' : a.status === 'approved' ? 'var(--success)' : a.status === 'posted' ? 'var(--text-muted)' : 'var(--warning)' }} />
                                                                            {a.agent_name} ({a.status === 'assigned' ? 'assigned' : a.status})
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            )}
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
                                                            {t.assignments && t.assignments.length > 0 && (
                                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                                                                    {t.assignments.map((a: any) => (
                                                                        <span key={a.agent_id} className="badge badge-muted" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.7rem' }}>
                                                                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: a.status === 'working' ? 'var(--accent)' : a.status === 'approved' ? 'var(--success)' : a.status === 'posted' ? 'var(--text-muted)' : 'var(--warning)' }} />
                                                                            {a.agent_name} ({a.status === 'assigned' ? 'assigned' : a.status})
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            )}
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

                                    {isAdmin && (
                                        <div style={{ gridColumn: 'span 2' }}>
                                            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 8 }}>ASSIGN TO AGENTS</label>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, background: 'var(--bg-secondary)', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)' }}>
                                                {agents.length === 0 ? (
                                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No agents available</span>
                                                ) : (
                                                    agents.map(a => {
                                                        const isChecked = selectedAgentIds.includes(a.id);
                                                        return (
                                                            <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: 'var(--text-primary)', cursor: 'pointer' }}>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={isChecked}
                                                                    onChange={() => {
                                                                        if (isChecked) {
                                                                            setSelectedAgentIds(selectedAgentIds.filter(id => id !== a.id));
                                                                        } else {
                                                                            setSelectedAgentIds([...selectedAgentIds, a.id]);
                                                                        }
                                                                    }}
                                                                />
                                                                {a.full_name} ({a.region})
                                                            </label>
                                                        );
                                                    })
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    <div className="grid-2">
                                        <div>
                                            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>DUE DATE</label>
                                            <input className="input" type="datetime-local" value={newTask.due_date} onChange={e => setNewTask(p => ({ ...p, due_date: e.target.value }))} />
                                        </div>
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
            {/* ── AI Composer Tab ───────────────────────────────────────────── */}
            {tab === 'composer' && (
                <div>
                    {/* Toggle Sub-tabs */}
                    <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                        <button
                            className={`btn ${composerSubTab === 'create' ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => { setComposerSubTab('create'); setSelectedHistoryPost(null); }}
                        >
                            ✍️ AI Post Composer
                        </button>
                        <button
                            className={`btn ${composerSubTab === 'history' ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => { setComposerSubTab('history'); setSelectedHistoryPost(null); }}
                        >
                            📜 Published Posts ({publishedPosts.length})
                        </button>
                    </div>

                    {composerSubTab === 'create' ? (
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

                                    {heatmap.length > 0 && (
                                        <div className="chart-container" style={{ position: 'relative' }}>
                                            <div className="chart-title">⏰ Best Time to Post ({region})</div>
                                            <div style={{ overflowX: 'auto', padding: '10px 0' }}>
                                                <div style={{ display: 'grid', gridTemplateColumns: `32px repeat(24, 1fr)`, gap: 2, minWidth: 500, position: 'relative' }}>
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
                                                                const isHovered = hoveredCell?.day === day && hoveredCell?.hour === h;
                                                                return (
                                                                    <div
                                                                        key={h}
                                                                        className="heatmap-cell"
                                                                        onMouseEnter={(e) => {
                                                                            const cellEl = e.currentTarget;
                                                                            const containerEl = cellEl.closest('.chart-container');
                                                                            if (containerEl) {
                                                                                const cellRect = cellEl.getBoundingClientRect();
                                                                                const containerRect = containerEl.getBoundingClientRect();
                                                                                setHoveredCell({
                                                                                    day,
                                                                                    hour: h,
                                                                                    engagement: cell?.engagement || 0,
                                                                                    x: cellRect.left - containerRect.left + cellRect.width / 2,
                                                                                    y: cellRect.top - containerRect.top
                                                                                });
                                                                            }
                                                                        }}
                                                                        onMouseLeave={() => setHoveredCell(null)}
                                                                        onClick={() => handleHeatmapCellClick(day, h)}
                                                                        style={{
                                                                            background: `rgba(0, 198, 167, ${intensity * 0.9 + 0.05})`,
                                                                            aspectRatio: '1',
                                                                            borderRadius: '3px',
                                                                            cursor: 'pointer',
                                                                            transition: 'all 0.15s ease',
                                                                            transform: isHovered ? 'scale(1.25)' : 'scale(1)',
                                                                            boxShadow: isHovered ? '0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -4px rgba(0, 0, 0, 0.3)' : 'none',
                                                                            border: isHovered ? '2px solid #fff' : '1px solid rgba(255,255,255,0.05)',
                                                                            zIndex: isHovered ? 10 : 1,
                                                                            position: 'relative'
                                                                        }}
                                                                    />
                                                                );
                                                            })}
                                                        </React.Fragment>
                                                    ))}
                                                </div>
                                            </div>
                                            {hoveredCell && (
                                                <div style={{
                                                    position: 'absolute',
                                                    left: hoveredCell.x,
                                                    top: hoveredCell.y,
                                                    transform: 'translate(-50%, -125%)',
                                                    background: '#0f172a',
                                                    color: '#fff',
                                                    padding: '8px 12px',
                                                    borderRadius: '8px',
                                                    fontSize: '0.75rem',
                                                    fontWeight: 600,
                                                    pointerEvents: 'none',
                                                    whiteSpace: 'nowrap',
                                                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5), 0 4px 6px -4px rgba(0, 0, 0, 0.5)',
                                                    zIndex: 9999,
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    alignItems: 'center',
                                                    gap: 4,
                                                    border: '1px solid rgba(255,255,255,0.1)'
                                                }}>
                                                    <div style={{ fontSize: '0.8rem', fontWeight: 700 }}>
                                                        📅 {hoveredCell.day} at {hoveredCell.hour}:00
                                                    </div>
                                                    <div style={{ color: '#2dd4bf', display: 'flex', alignItems: 'center', gap: 4 }}>
                                                        🔥 {hoveredCell.engagement} engagement
                                                    </div>
                                                    <div style={{ color: '#94a3b8', fontSize: '0.62rem', fontWeight: 400, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 4, marginTop: 2 }}>
                                                        ⚡ Click to schedule post
                                                    </div>
                                                    <div style={{
                                                        position: 'absolute',
                                                        top: '100%',
                                                        left: '50%',
                                                        transform: 'translateX(-50%)',
                                                        width: 0,
                                                        height: 0,
                                                        borderLeft: '6px solid transparent',
                                                        borderRight: '6px solid transparent',
                                                        borderTop: '6px solid #0f172a',
                                                    }} />
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : (
                        /* Published Posts History view */
                        <div>
                            {selectedHistoryPost ? (
                                /* Detailed view */
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                    <button
                                        className="btn btn-ghost btn-sm"
                                        onClick={() => setSelectedHistoryPost(null)}
                                        style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                                    >
                                        ← Back to posts
                                    </button>

                                    <div className="split-pane">
                                        {/* Left Column */}
                                        <div className="composer-pane" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                            <div className="glass-card" style={{ padding: 18 }}>
                                                <h4 style={{ margin: 0, marginBottom: 12 }}>Post Content</h4>
                                                <div style={{
                                                    fontSize: '0.85rem',
                                                    color: 'var(--text-primary)',
                                                    background: 'var(--bg-tertiary)',
                                                    padding: 12,
                                                    borderRadius: 6,
                                                    whiteSpace: 'pre-wrap',
                                                    lineHeight: 1.6,
                                                    maxHeight: 250,
                                                    overflowY: 'auto'
                                                }}>
                                                    {selectedHistoryPost.content}
                                                </div>
                                            </div>

                                            {/* LinkedIn Post Link Card */}
                                            <div className="glass-card" style={{ padding: 18 }}>
                                                <h4 style={{ margin: 0, marginBottom: 6 }}>🔗 LinkedIn post link</h4>
                                                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                                                    <input
                                                        className="input"
                                                        placeholder="https://www.linkedin.com/feed/update/urn:li:share:..."
                                                        value={editingLinkUrl}
                                                        onChange={e => setEditingLinkUrl(e.target.value)}
                                                    />
                                                    <button
                                                        className="btn btn-primary"
                                                        onClick={() => handleSaveLinkedInLink(editingLinkUrl)}
                                                    >
                                                        Save
                                                    </button>
                                                </div>
                                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 6 }}>
                                                    Paste the LinkedIn URL here to enable sync and preview.
                                                </div>
                                            </div>

                                            {/* Engagement Metrics Card */}
                                            <div className="glass-card" style={{ padding: 18 }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                                                    <div>
                                                        <h4 style={{ margin: 0 }}>📊 Engagement metrics</h4>
                                                        {!selectedHistoryPost.linkedin_post_id && (
                                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>
                                                                Add LinkedIn URL above to enable sync
                                                            </div>
                                                        )}
                                                    </div>
                                                    <button
                                                        className="btn btn-secondary btn-sm"
                                                        disabled={!selectedHistoryPost.linkedin_post_id}
                                                        onClick={handleDemoSync}
                                                    >
                                                        Demo sync
                                                    </button>
                                                </div>

                                                <div className="grid-3">
                                                    <div style={{ background: 'var(--bg-tertiary)', padding: 12, borderRadius: 8, textAlign: 'center' }}>
                                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>LIKES</div>
                                                        <div style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: 4, color: 'var(--success)' }}>
                                                            {historyPostMetrics.likes || 0}
                                                        </div>
                                                    </div>
                                                    <div style={{ background: 'var(--bg-tertiary)', padding: 12, borderRadius: 8, textAlign: 'center' }}>
                                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>COMMENTS</div>
                                                        <div style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: 4, color: 'var(--accent)' }}>
                                                            {historyPostMetrics.comments || 0}
                                                        </div>
                                                    </div>
                                                    <div style={{ background: 'var(--bg-tertiary)', padding: 12, borderRadius: 8, textAlign: 'center' }}>
                                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>SHARES</div>
                                                        <div style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: 4, color: 'var(--info)' }}>
                                                            {historyPostMetrics.shares || 0}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Right Column */}
                                        <div className="composer-pane" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                            <h4 style={{ marginBottom: 0 }}>LinkedIn Live Preview</h4>

                                            <LinkedInPreview
                                                content={selectedHistoryPost.content}
                                                hashtags={selectedHistoryPost.hashtags}
                                            />

                                            {selectedHistoryPost.hashtags && (
                                                <div className="glass-card" style={{ padding: 14 }}>
                                                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>HASHTAGS USED</div>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                                        {selectedHistoryPost.hashtags.split(/\s+/).map((h, i) => (
                                                            <span key={i} className="badge badge-accent" style={{ fontSize: '0.7rem' }}>
                                                                {h}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                /* List view */
                                <div>
                                    {/* KPI Summary Cards */}
                                    <div className="grid-4" style={{ marginBottom: 20 }}>
                                        <div className="glass-card" style={{ padding: 16 }}>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>TOTAL POSTS</div>
                                            <div style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: 4 }}>{publishedPosts.length}</div>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>{filteredHistoryPosts.length} filtered</div>
                                        </div>
                                        <div className="glass-card" style={{ padding: 16 }}>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>THIS MONTH</div>
                                            <div style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: 4 }}>{postsThisMonth}</div>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>Active postings</div>
                                        </div>
                                        <div className="glass-card" style={{ padding: 16 }}>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>TOTAL ENGAGEMENT</div>
                                            <div style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: 4 }}>{totalEngagement}</div>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>Likes + Comments + Shares</div>
                                        </div>
                                        <div className="glass-card" style={{ padding: 16 }}>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>AVG PER POST</div>
                                            <div style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: 4 }}>{avgEngagement}</div>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>Average engagement</div>
                                        </div>
                                    </div>

                                    {/* Filters panel */}
                                    <div className="glass-card" style={{ padding: 16, marginBottom: 20 }}>
                                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                                            <div style={{ flex: 1, minWidth: 200 }}>
                                                <input
                                                    className="input"
                                                    placeholder="Search posts..."
                                                    value={historySearch}
                                                    onChange={e => setHistorySearch(e.target.value)}
                                                />
                                            </div>
                                            <div>
                                                <select className="select" value={historyType} onChange={e => setHistoryType(e.target.value)}>
                                                    <option value="all">All types</option>
                                                    <option value="job_posting">Job posting</option>
                                                    <option value="jd_post">JD post</option>
                                                    <option value="industry_tip">Industry tip</option>
                                                    <option value="ai_carousel">AI Carousel</option>
                                                    <option value="resume_advice">Resume advice</option>
                                                    <option value="general">General</option>
                                                </select>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>From:</span>
                                                <input className="input" type="date" value={historyFromDate} onChange={e => setHistoryFromDate(e.target.value)} style={{ width: 'auto' }} />
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>To:</span>
                                                <input className="input" type="date" value={historyToDate} onChange={e => setHistoryToDate(e.target.value)} style={{ width: 'auto' }} />
                                            </div>
                                            {(historySearch || historyFromDate || historyToDate || historyType !== 'all') && (
                                                <button
                                                    className="btn btn-ghost btn-sm"
                                                    onClick={() => {
                                                        setHistorySearch('');
                                                        setHistoryFromDate('');
                                                        setHistoryToDate('');
                                                        setHistoryType('all');
                                                    }}
                                                    style={{ color: 'var(--danger)' }}
                                                >
                                                    Clear Filters
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Posts Scrollable Container */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 600, overflowY: 'auto', paddingRight: 4 }}>
                                        {filteredHistoryPosts.length === 0 && (
                                            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', border: '2px dashed var(--border)', borderRadius: 8 }}>
                                                No published posts found 📭
                                            </div>
                                        )}
                                        {filteredHistoryPosts.map(p => {
                                            return (
                                                <div
                                                    key={p.id}
                                                    className="glass-card hover-glow"
                                                    style={{
                                                        padding: 16,
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        alignItems: 'center',
                                                        gap: 16,
                                                        transition: 'all 0.2s'
                                                    }}
                                                >
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div
                                                            style={{
                                                                fontSize: '0.88rem',
                                                                color: 'var(--text-primary)',
                                                                lineHeight: 1.5,
                                                                whiteSpace: 'pre-wrap'
                                                            }}
                                                            className="truncate"
                                                            title={p.content}
                                                        >
                                                            {p.content.length > 220 ? p.content.slice(0, 220) + '...' : p.content}
                                                        </div>
                                                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                                                            <span className="badge badge-accent" style={{ fontSize: '0.62rem' }}>
                                                                {p.linkedin_post_id ? 'Link Synced 🔗' : 'Text Post'}
                                                            </span>
                                                            <span className="badge badge-purple" style={{ fontSize: '0.62rem' }}>{p.region}</span>
                                                            <span className="badge badge-gray" style={{ fontSize: '0.62rem' }}>
                                                                {p.published_at ? new Date(p.published_at).toLocaleDateString() : new Date(p.created_at).toLocaleDateString()}
                                                            </span>
                                                            {p.linkedin_post_id && (
                                                                <a
                                                                    href={p.linkedin_post_id}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    style={{ fontSize: '0.73rem', color: 'var(--accent)', textDecoration: 'none', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                                                >
                                                                    Open ↗
                                                                </a>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                                                        <button
                                                            className="btn btn-secondary btn-sm"
                                                            onClick={() => handleViewPostDetails(p)}
                                                        >
                                                            View
                                                        </button>
                                                        <button
                                                            className="btn btn-ghost btn-icon btn-sm"
                                                            style={{ color: 'var(--danger)' }}
                                                            onClick={() => handleDeleteHistoryPost(p.id)}
                                                        >
                                                            🗑️
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
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

            {/* Submitted confirmation popup */}
            {showSubmittedPopup && (
                <div className="modal-overlay" onClick={() => setShowSubmittedPopup(false)}>
                    <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 400, textAlign: 'center', padding: '30px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                            <div style={{
                                width: 60, height: 60, borderRadius: '50%',
                                background: 'rgba(16, 185, 129, 0.1)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: 'var(--success)', marginBottom: 8
                            }}>
                                <CheckCircle size={36} />
                            </div>
                            <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>Submitted!</h3>
                            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                                Your post has been successfully submitted for review. The manager has been notified, and you have received a confirmation notification.
                            </p>
                            <button
                                className="btn btn-primary"
                                onClick={() => setShowSubmittedPopup(false)}
                                style={{ width: '100%', marginTop: 8 }}
                            >
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {alerts && alerts.length > 0 && <span style={{ display: 'none' }}>{alerts.length}</span>}
        </div>
    );
};
