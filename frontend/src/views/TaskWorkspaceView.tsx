import React, { useEffect, useState, useRef } from 'react';
import {
    Sparkles, CheckCircle, Eye, FileText, Plus, X, Trash2, Edit3,
    ThumbsUp, MessageSquare, Repeat, Send, Search, Globe, Share2
} from 'lucide-react';
import { tasksApi, postsApi, aiApi, metricsApi, usersApi, API_BASE_URL } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { Task, Post, User, KanbanBoard } from '../types';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { richRecurrenceDates, RICH_RECURRENCE_OPTIONS, WEEKDAY_OPTIONS, RichRecurrenceConfig, RichRecurrenceType } from '../utils/recurrence';
import toast from 'react-hot-toast';

const POST_TYPES = ['general', 'job_posting', 'jd_post', 'industry_tip', 'ai_carousel', 'resume_advice'];
const TONES = ['professional', 'casual', 'enthusiastic', 'informative', 'inspirational'];
const EMOJIS = ['🚀', '💡', '✅', '🌟', '🎯', '📊', '💼', '🤝', '🔥', '👋'];

// ── LinkedIn Post Preview ──────────────────────────────────────────────────
const LinkedInPreview: React.FC<{
    content: string;
    hashtags: string;
    imageUrl?: string;
    authorName?: string;
    authorAvatar?: string;
    initialLikes?: number;
    initialComments?: number;
    initialShares?: number;
    postStatus?: string;
}> = ({ content, hashtags, imageUrl, authorName = "GOrecruitAI", authorAvatar, initialLikes = 0, initialComments = 0, initialShares = 0, postStatus }) => {
    const [liked, setLiked] = useState(false);
    const [reposted, setReposted] = useState(false);
    const [sharesOffset, setSharesOffset] = useState(0);
    const [commentsList, setCommentsList] = useState<{ author: string; text: string; time: string }[]>([]);
    const [commentInput, setCommentInput] = useState('');
    const [showCommentBox, setShowCommentBox] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const [shared, setShared] = useState(false);

    const handleLike = () => setLiked(!liked);
    const handleRepost = () => setReposted(!reposted);
    const handleSend = () => {
        setShared(!shared);
        if (!shared) {
            setSharesOffset(prev => prev + 1);
        } else {
            setSharesOffset(prev => prev - 1);
        }
    };

    useEffect(() => {
        setLiked(false);
        setReposted(false);
        setSharesOffset(0);
        setCommentsList([]);
    }, [content, initialLikes, initialComments, initialShares]);

    const totalLikes = initialLikes + (liked ? 1 : 0);
    const totalComments = initialComments + commentsList.length;
    const totalReposts = initialShares + (reposted ? 1 : 0) + sharesOffset;

    const handleAddComment = () => {
        if (!commentInput.trim()) return;
        setCommentsList(prev => [...prev, {
            author: "You (Agent)",
            text: commentInput.trim(),
            time: "Just now"
        }]);
        setCommentInput('');
    };

    const tags = hashtags ? hashtags.split(/\s+/).filter(Boolean) : [];
    const isLong = content.length > 180;
    const displayedContent = expanded || !isLong ? content : content.slice(0, 180) + '...';

    return (
        <div style={{ background: '#ffffff', border: '1px solid #e0e0e0', borderRadius: '8px', overflow: 'hidden', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif' }}>
            <div style={{ background: '#f3f6f8', padding: '10px 16px', borderBottom: '1px solid #e0e0e0', color: '#666666', fontSize: '0.78rem', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>linkedin.com · Interactive Live Preview</span>
                <span className={`badge ${postStatus === 'published' ? 'badge-success' : 'badge-accent'}`} style={{ fontSize: '0.62rem', margin: 0 }}>
                    {postStatus || 'Draft'}
                </span>
            </div>
            
            <div style={{ padding: '16px 16px 12px' }}>
                {/* Author Info */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                    <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#0a66c2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', fontWeight: 700, color: '#ffffff', overflow: 'hidden' }}>
                        {authorAvatar ? <img src={authorAvatar} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : authorName[0].toUpperCase()}
                    </div>
                    <div>
                        <div style={{ color: '#191919', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                            {authorName}
                            <span style={{ color: '#0a66c2', fontSize: '0.72rem', fontWeight: 700 }}>• 1st</span>
                        </div>
                        <div style={{ color: '#666666', fontSize: '0.72rem', lineHeight: 1.3 }}>IT Staffing & Recruitment Specialist</div>
                        <div style={{ color: '#666666', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: 4, marginTop: 1 }}>
                            <span>Just now</span>
                            <span>•</span>
                            <Globe size={11} />
                        </div>
                    </div>
                </div>

                {/* Post Content */}
                <div style={{ color: '#191919', fontSize: '0.85rem', lineHeight: 1.5, whiteSpace: 'pre-wrap', marginBottom: 10 }}>
                    {content ? (
                        <>
                            {displayedContent}
                            {isLong && !expanded && (
                                <span 
                                    onClick={() => setExpanded(true)} 
                                    style={{ color: '#666666', fontWeight: 600, cursor: 'pointer', marginLeft: 4, fontSize: '0.78rem' }}
                                >
                                    ...see more
                                </span>
                            )}
                        </>
                    ) : (
                        <span style={{ color: '#8b9dc3', fontStyle: 'italic' }}>Your post content will appear here...</span>
                    )}
                </div>

                {/* Tags */}
                {tags.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 8px', marginBottom: 12 }}>
                        {tags.map((t, i) => (
                            <span key={i} style={{ color: '#0a66c2', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>
                                {t.startsWith('#') ? t : `#${t}`}
                            </span>
                        ))}
                    </div>
                )}

                {/* Image/Video media attachment */}
                {imageUrl && (
                    <div style={{ background: '#f3f6f8', border: '1px solid #e0e0e0', borderRadius: '6px', overflow: 'hidden', marginBottom: 12, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                        {/\.(mp4|mov|webm)$/i.test(imageUrl) ? (
                            <video src={imageUrl} controls style={{ width: '100%', maxHeight: 280, objectFit: 'contain' }} />
                        ) : (
                            <img src={imageUrl} alt="attachment" style={{ width: '100%', maxHeight: 280, objectFit: 'cover' }} />
                        )}
                    </div>
                )}

                {/* Reactions Count Bar */}
                {(totalLikes > 0 || totalComments > 0 || totalReposts > 0) && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 8, borderBottom: '1px solid #ebebeb', marginBottom: 6, fontSize: '0.72rem', color: '#666666' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            {totalLikes > 0 && (
                                <div style={{ display: 'flex', alignItems: 'center' }}>
                                    <span style={{ background: '#0a66c2', color: '#ffffff', borderRadius: '50%', width: 14, height: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.52rem', fontWeight: 'bold' }}>👍</span>
                                    <span style={{ background: '#ef4444', color: '#ffffff', borderRadius: '50%', width: 14, height: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.52rem', marginLeft: -4 }}>❤️</span>
                                    <span style={{ marginLeft: 6 }}>{totalLikes}</span>
                                </div>
                            )}
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            {totalComments > 0 && <span>{totalComments} comment{totalComments > 1 ? 's' : ''}</span>}
                            {totalReposts > 0 && <span>{totalReposts} repost{totalReposts > 1 ? 's' : ''}</span>}
                        </div>
                    </div>
                )}

                {/* Actions Toolbar */}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0 0', marginTop: 4 }}>
                    <button 
                        onClick={handleLike}
                        style={{ display: 'flex', alignItems: 'center', justifyItems: 'center', gap: 6, padding: '6px 10px', border: 'none', background: 'transparent', borderRadius: '4px', cursor: 'pointer', color: liked ? '#0a66c2' : '#666666', fontSize: '0.78rem', fontWeight: 600, transition: 'background 0.2s' }}
                    >
                        <ThumbsUp size={14} fill={liked ? '#0a66c2' : 'none'} />
                        <span>Like</span>
                    </button>

                    <button 
                        onClick={() => setShowCommentBox(!showCommentBox)}
                        style={{ display: 'flex', alignItems: 'center', justifyItems: 'center', gap: 6, padding: '6px 10px', border: 'none', background: 'transparent', borderRadius: '4px', cursor: 'pointer', color: showCommentBox ? '#0a66c2' : '#666666', fontSize: '0.78rem', fontWeight: 600, transition: 'background 0.2s' }}
                    >
                        <MessageSquare size={14} fill={showCommentBox ? 'rgba(10, 102, 194, 0.1)' : 'none'} />
                        <span>Comment</span>
                    </button>

                    <button 
                        onClick={handleRepost}
                        style={{ display: 'flex', alignItems: 'center', justifyItems: 'center', gap: 6, padding: '6px 10px', border: 'none', background: 'transparent', borderRadius: '4px', cursor: 'pointer', color: reposted ? '#0a66c2' : '#666666', fontSize: '0.78rem', fontWeight: 600, transition: 'background 0.2s' }}
                    >
                        <Repeat size={14} strokeWidth={reposted ? 2.5 : 2} />
                        <span>Repost</span>
                    </button>

                    <button 
                        onClick={handleSend}
                        style={{ display: 'flex', alignItems: 'center', justifyItems: 'center', gap: 6, padding: '6px 10px', border: 'none', background: 'transparent', borderRadius: '4px', cursor: 'pointer', color: shared ? '#0a66c2' : '#666666', fontSize: '0.78rem', fontWeight: 600, transition: 'background 0.2s' }}
                    >
                        <Send size={14} fill={shared ? '#0a66c2' : 'none'} />
                        <span>Send</span>
                    </button>
                </div>

                {/* Inline Comment Box */}
                {showCommentBox && (
                    <div style={{ marginTop: 12, borderTop: '1px solid #ebebeb', paddingTop: 12 }}>
                        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                            <input 
                                className="input" 
                                placeholder="Add a comment..." 
                                value={commentInput}
                                onChange={e => setCommentInput(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') handleAddComment(); }}
                                style={{ flex: 1, fontSize: '0.78rem', background: '#f3f6f8', border: '1px solid #d0d0d0', padding: '6px 12px', height: 'auto', borderRadius: '20px', color: '#191919' }}
                            />
                            <button 
                                className="btn btn-primary btn-sm" 
                                onClick={handleAddComment}
                                style={{ borderRadius: '20px', padding: '4px 14px', fontSize: '0.75rem' }}
                            >
                                Post
                            </button>
                        </div>

                        {/* List of comments */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 150, overflowY: 'auto' }}>
                            {commentsList.map((c, idx) => (
                                <div key={idx} style={{ display: 'flex', gap: 8, background: '#f2f2f2', padding: '8px 10px', borderRadius: '8px' }}>
                                    <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#0a66c2', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700, flexShrink: 0 }}>
                                        {c.author[0]}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#191919' }}>{c.author}</span>
                                            <span style={{ fontSize: '0.62rem', color: '#666666' }}>{c.time}</span>
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: '#191919', marginTop: 1, lineHeight: 1.3, wordBreak: 'break-word' }}>{c.text}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
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
                        key={col.key as string}
                        className={`kanban-col ${isActiveDrop ? 'drag-over' : ''}`}
                        onDragOver={(e) => onDragOver(e, col.key as string)}
                        onDragLeave={onDragLeave}
                        onDrop={(e) => onDrop(e, col.key as string)}
                    >
                        <div className="kanban-col-header" style={{ color: col.color }}>
                            {col.label}
                            <span className="badge badge-muted" style={{ marginLeft: 'auto' }}>{board[col.key]?.length || 0}</span>
                        </div>
                        {(board[col.key] || []).map(post => {
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
                                            <button key={c.key as string} className="btn btn-ghost" style={{ fontSize: '0.65rem', padding: '3px 8px' }} onClick={() => movePost(post.id, c.key as string)}>
                                                → {c.key as string}
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
    const [board, setBoard] = useState<KanbanBoard>({ draft: [], in_review: [], approved: [], scheduled: [], rejected: [] });
    const [templates, setTemplates] = useState<Post[]>([]);
    const [, setHeatmap] = useState<any[]>([]);
    const [pendingTasks, setPendingTasks] = useState<any[]>([]);
    const [tab, setTab] = useState<'tasks' | 'composer' | 'kanban' | 'library' | 'alerts'>('tasks');

    const [searchParams] = useSearchParams();
    const taskIdParam = searchParams.get('taskId');
    const tabParam = searchParams.get('tab');
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
    const [agents, setAgents] = useState<User[]>([]);
    const [showAddTask, setShowAddTask] = useState(false);
    const [newTask, setNewTask] = useState({
        title: '',
        description: '',
        due_date: '',
        priority: 'medium',
        region: 'Global'
    });
    const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
    const [taskRecurrence, setTaskRecurrence] = useState<RichRecurrenceConfig>({
        type: 'none',
        weeklyDay: '1',
        monthlyDay: '1',
        customIntervalDays: 3,
        count: 4,
        endDate: ''
    });



    // AI Composer state
    const [writeMode, setWriteMode] = useState<'manual' | 'ai'>('ai');
    const [prompt, setPrompt] = useState('');
    const [manualContent, setManualContent] = useState('');
    const [postType, setPostType] = useState('general');
    const [tone, setTone] = useState('professional');
    const [hashtags, setHashtags] = useState('');
    const [generatedContent, setGeneratedContent] = useState('');
    const [generatingAI, setGeneratingAI] = useState(false);
    const [enhancingAI, setEnhancingAI] = useState(false);
    const [previewContent, setPreviewContent] = useState('');
    const [scheduledAt, setScheduledAt] = useState('');
    const [_predictedReach, setPredictedReach] = useState<any>(null);
    const [savingPost, setSavingPost] = useState(false);
    const [editingPostId, setEditingPostId] = useState<string | null>(null);
    const [publishDirectly, setPublishDirectly] = useState(false);
    const [imageUrl, setImageUrl] = useState('');
    const [uploadingImage, setUploadingImage] = useState(false);
    const [reviewComments, setReviewComments] = useState<Record<string, string>>({});
    const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    // const [hoveredCell, setHoveredCell] = useState<{ day: string; hour: number; engagement: number; x: number; y: number } | null>(null);

    // Published Posts History
    const [composerSubTab, setComposerSubTab] = useState<'create' | 'history'>('create');
    const [publishedPosts, setPublishedPosts] = useState<Post[]>([]);
    const [selectedHistoryPost, setSelectedHistoryPost] = useState<Post | null>(null);
    const [historyPostMetrics, setHistoryPostMetrics] = useState<any>({ available: false });
    const [historySearch, setHistorySearch] = useState('');
    const [historyFromDate, setHistoryFromDate] = useState('');
    const [historyToDate, setHistoryToDate] = useState('');
    const [historyType, setHistoryType] = useState('all');
    const [editingLinkUrl, setEditingLinkUrl] = useState('');
    const [employeeSearch, setEmployeeSearch] = useState('');




    const filteredHistoryPosts = publishedPosts.filter(p => {
        const matchesSearch = !historySearch || p.content.toLowerCase().includes(historySearch.toLowerCase()) || (p.title && p.title.toLowerCase().includes(historySearch.toLowerCase()));
        const matchesType = historyType === 'all' || p.post_type === historyType;

        const pubTime = p.published_at ? new Date(p.published_at).getTime() : new Date(p.created_at).getTime();
        const matchesFrom = !historyFromDate || pubTime >= new Date(historyFromDate).getTime();
        const matchesTo = !historyToDate || pubTime <= new Date(historyToDate + 'T23:59:59').getTime();

        return matchesSearch && matchesType && matchesFrom && matchesTo;
    });

    // Real, derivable-from-data counts (per-post engagement is not available via the LinkedIn API).
    // const postsWithLink = filteredHistoryPosts.filter(p => !!p.linkedin_post_id).length;
    // const distinctPostTypes = new Set(filteredHistoryPosts.map(p => p.post_type).filter(Boolean)).size;
    const postsThisMonth = filteredHistoryPosts.filter(p => {
        const date = p.published_at ? new Date(p.published_at) : new Date(p.created_at);
        return date.getMonth() === new Date().getMonth() && date.getFullYear() === new Date().getFullYear();
    }).length;

    useEffect(() => {
        loadAll();
        // Near-realtime: keep task/approval/kanban state fresh for both roles.
        const id = setInterval(loadAll, 7000);
        return () => clearInterval(id);
    }, [region]);
    useEffect(() => { setPreviewContent(generatedContent); }, [generatedContent]);

    useEffect(() => {
        if (taskIdParam) {
            setSelectedTaskId(taskIdParam);
            const action = searchParams.get('action');
            const tabParamVal = searchParams.get('tab');
            if (tabParamVal === 'composer' || action === 'publish') {
                setTab('composer');
            } else {
                setTab('tasks');
            }
        } else if (tabParam === 'alerts') {
            setTab('alerts');
        }
    }, [taskIdParam, tabParam, searchParams]);

    useEffect(() => {
        if (selectedTaskId && tasks.length > 0) {
            const activeTask = tasks.find(t => t.id === selectedTaskId);
            if (activeTask?.post) {
                setPreviewContent(activeTask.post.content);
                setGeneratedContent(activeTask.post.content);
                setTone(activeTask.post.tone || 'professional');
                setHashtags(activeTask.post.hashtags || '');
                setImageUrl(activeTask.post.image_url || '');
            }
        }
    }, [selectedTaskId]);

    const loadAll = async () => {
        try {
            const [tRes, bRes, tmplRes, hmRes, pubRes, agRes] = await Promise.all([
                tasksApi.list({ region: region === 'Global' ? undefined : region }),
                postsApi.kanban(region === 'Global' ? undefined : region),
                postsApi.list({ is_template: true }),
                metricsApi.bestTime(region === 'Global' ? undefined : region),
                postsApi.list({ status: 'published', region: region === 'Global' ? undefined : region }),
                usersApi.list({ role: 'agent' }),
            ]);
            setTasks(tRes.data);
            setBoard(bRes.data);
            setTemplates(tmplRes.data);
            setHeatmap(hmRes.data.heatmap);
            setPublishedPosts(pubRes.data);
            setAgents(agRes.data);

            if (isAdmin) {
                const paRes = await tasksApi.pendingApprovals();
                setPendingTasks(paRes.data);
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

    const handleEnhanceAI = async () => {
        if (!manualContent) return;
        setEnhancingAI(true);
        try {
            const res = await aiApi.improvePost(manualContent, 'engagement');
            if (res.data.error) throw new Error(res.data.error);
            setManualContent(res.data.content);
            setPreviewContent(res.data.content);
            toast.success('Content enhanced!');
            
            // Optionally predict reach
            const reachRes = await aiApi.predictReach({ content: res.data.content, region });
            setPredictedReach(reachRes.data);
        } catch (err: any) { toast.error(err.message || 'AI enhancement failed'); }
        setEnhancingAI(false);
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
                image_url: imageUrl,
                scheduled_at: scheduledAt || undefined,
                is_template: false,
                status: (publishDirectly || isAdmin) ? 'approved' : 'in_review',
                task_id: selectedTaskId || undefined
            };
            let createdPost = null;
            if (editingPostId) {
                const res = await postsApi.update(editingPostId, payload);
                createdPost = res.data;
                toast.success(isAdmin ? 'Post updated!' : 'Changes saved — sent to admin for review');
                setEditingPostId(null);
            } else {
                const res = await postsApi.create(payload);
                createdPost = res.data;
                toast.success(isAdmin ? 'Post created and approved!' : 'Post created and submitted for review!');
            }
            setSelectedTaskId(null);

            if (publishDirectly && createdPost && createdPost.id) {
                const toastId = toast.loading('Publishing directly to LinkedIn...');
                try {
                    await postsApi.publish(createdPost.id);
                    toast.success('Published directly to LinkedIn!', { id: toastId });
                } catch (err: any) {
                    const errMsg = err.response?.data?.detail || 'Failed to publish to LinkedIn';
                    toast.error(errMsg, { id: toastId });
                }
            }
            setPreviewContent(''); setGeneratedContent(''); setPrompt(''); setScheduledAt('');
            setPublishDirectly(false); setImageUrl('');
            loadAll();
        } catch { toast.error('Failed to save post'); }
        setSavingPost(false);
    };

    const handleImageUpload = async (file: File | null) => {
        if (!file) return;
        if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) { toast.error('Please choose an image or video file'); return; }
        if (file.size > 50 * 1024 * 1024) { toast.error('Media too large (max 50 MB)'); return; }
        setUploadingImage(true);
        try {
            const res = await postsApi.uploadMedia(file);
            // store an absolute URL so the preview and LinkedIn post resolve it anywhere
            setImageUrl(`${API_BASE_URL}${res.data.url}`);
            toast.success('Media added');
        } catch {
            toast.error('Media upload failed');
        }
        setUploadingImage(false);
    };

    // Load an existing post into the composer so the agent can edit it. Saving the
    // edits re-submits it for admin review (handled by the backend update flow).
    const openPostForEditing = (t: Task) => {
        if (!t.post) return;
        setSelectedTaskId(t.id);
        setEditingPostId(t.post.id);
        setPreviewContent(t.post.content);
        setGeneratedContent(t.post.content);
        setTone(t.post.tone || 'professional');
        setHashtags(t.post.hashtags || '');
        setImageUrl(t.post.image_url || '');
        setPredictedReach(null);
        setTab('composer');
        setDetailTaskId(null);
    };

    const handlePublishLive = async () => {
        if (!selectedTaskId) return;
        const task = tasks.find(t => t.id === selectedTaskId);
        if (!task || !task.post?.id) {
            toast.error("No approved post linked to this task.");
            return;
        }
        setSavingPost(true);
        try {
            await postsApi.publish(task.post.id);
            toast.success("Post published live! Task completed.");
            setSelectedTaskId(null);
            setPreviewContent(''); setGeneratedContent(''); setPrompt(''); setManualContent(''); setScheduledAt(''); setImageUrl('');
            loadAll();
        } catch (err: any) {
            const msg = err.response?.data?.detail || "Failed to publish post.";
            toast.error(msg);
        } finally {
            setSavingPost(false);
        }
    };

    const handleViewPostDetails = async (post: Post) => {
        setSelectedHistoryPost(post);
        setEditingLinkUrl(post.linkedin_post_id || '');
        try {
            const res = await metricsApi.posts({ post_id: post.id });
            if (res.data && res.data.length > 0) {
                setHistoryPostMetrics({ ...res.data[0], available: true });
            } else {
                // LinkedIn does not expose per-post engagement to this token — don't fabricate.
                setHistoryPostMetrics({ available: false });
            }
        } catch {
            setHistoryPostMetrics({ available: false });
        }
    };

    const handleDemoSync = async () => {
        const activePostId = selectedHistoryPost?.id || (selectedTaskId ? tasks.find(t => t.id === selectedTaskId)?.post?.id : null);
        if (!activePostId) return;
        try {
            const res = await postsApi.syncMetrics(activePostId);
            if (res.data?.available) {
                setHistoryPostMetrics({ ...res.data, available: true });
                toast.success("Metrics synced from LinkedIn");
            } else {
                setHistoryPostMetrics({ available: false });
                toast("Per-post metrics aren't available via the LinkedIn API for this token", { icon: 'ℹ️' });
            }
        } catch {
            toast.error("Failed to sync metrics.");
        }
    };

    const handleSaveLinkedInLink = async (url: string) => {
        const activePostId = selectedHistoryPost?.id || (selectedTaskId ? tasks.find(t => t.id === selectedTaskId)?.post?.id : null);
        if (!activePostId) return;
        try {
            const res = await postsApi.saveLink(activePostId, { linkedin_url: url });
            if (selectedHistoryPost) {
                setSelectedHistoryPost(res.data);
            }
            toast.success("LinkedIn post link saved!");
            loadAll();
        } catch {
            toast.error("Failed to save LinkedIn link.");
        }
    };

    const handleToggleEmployeeEngagement = async (postId: string, employeeId: string, actionType: 'like' | 'comment' | 'share', currentState: boolean) => {
        try {
            await postsApi.toggleEmployeeEngagement(postId, {
                employee_id: employeeId,
                action_type: actionType,
                state: !currentState
            });
            loadAll();
        } catch {
            toast.error("Failed to update engagement action.");
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

    const handleAddTask = async () => {
        if (!newTask.title.trim()) return toast.error('Task title is required');
        try {
            const base = newTask.due_date ? new Date(newTask.due_date) : new Date();
            const dates = richRecurrenceDates(base, taskRecurrence);
            const endVal = taskRecurrence.endDate ? format(new Date(taskRecurrence.endDate), "yyyy-MM-dd'T'23:59:59") : undefined;
            for (const d of dates) {
                await tasksApi.create({
                    title: newTask.title,
                    description: newTask.description,
                    priority: newTask.priority,
                    region: newTask.region,
                    recurrence: taskRecurrence.type,
                    recurrence_end_date: endVal,
                    due_date: newTask.due_date ? format(d, "yyyy-MM-dd'T'HH:mm:ss") : undefined,
                    assigned_to_ids: selectedAgentIds.length > 0 ? selectedAgentIds : undefined
                });
            }
            const many = dates.length > 1;
            toast.success(many
                ? `${isAdmin ? 'Created' : 'Submitted'} ${dates.length} recurring tasks`
                : (isAdmin ? 'Task created!' : 'Task submitted for approval'));
            setShowAddTask(false);
            setNewTask({ title: '', description: '', due_date: '', priority: 'medium', region: 'Global' });
            setSelectedAgentIds([]);
            setTaskRecurrence({ type: 'none', weeklyDay: '1', monthlyDay: '1', customIntervalDays: 3, count: 4, endDate: '' });
            loadAll();
        } catch { toast.error('Failed to create task'); }
    };

    const handleAcceptTask = async (taskId: string) => {
        try {
            await tasksApi.accept(taskId);
            toast.success('Task accepted! Opened in AI Composer.');
            setSelectedTaskId(taskId);

            // Look up task title & description to pre-populate prompt
            const task = tasks.find(t => t.id === taskId);
            if (task) {
                setPrompt(task.title + (task.description ? `\n\nContext:\n${task.description}` : ''));
            }
            setTab('composer');
            loadAll();
        } catch (err: any) {
            const msg = err.response?.data?.detail || 'Failed to accept task';
            toast.error(msg);
        }
    };

    const handleRemoveTask = async (taskId: string) => {
        if (!window.confirm('Are you sure you want to delete this task?')) return;
        try {
            await tasksApi.delete(taskId);
            toast.success('Task deleted!');
            setSelectedIds(prev => prev.filter(id => id !== taskId));
            loadAll();
        } catch { toast.error('Failed to delete task'); }
    };

    // Admins may delete any task; agents may delete only tasks they created.
    const canDelete = (t: Task) => isAdmin || t.created_by_id === user?.id;
    const toggleSelect = (id: string) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

    const handleBulkDelete = async () => {
        if (selectedIds.length === 0) return;
        if (!window.confirm(`Delete ${selectedIds.length} selected task${selectedIds.length > 1 ? 's' : ''}? This cannot be undone.`)) return;
        try {
            const res = await tasksApi.bulkDelete(selectedIds);
            const deleted = res.data?.deleted_count ?? 0;
            const skipped = res.data?.skipped_count ?? 0;
            if (deleted > 0) toast.success(`Deleted ${deleted} task${deleted > 1 ? 's' : ''}`);
            if (skipped > 0) toast(`${skipped} skipped — you can only delete tasks you created`, { icon: 'ℹ️' });
            if (deleted === 0 && skipped === 0) toast('Nothing to delete', { icon: 'ℹ️' });
            setSelectedIds([]);
            loadAll();
        } catch { toast.error('Bulk delete failed'); }
    };

    // Guard against double-submits — e.g. an admin double-clicking "Approve & Publish",
    // which could otherwise fire two concurrent publishes. The synchronous ref check wins
    // even against rapid clicks before React re-renders; approvingId drives button state.
    const approvingRef = useRef<Set<string>>(new Set());
    const [approvingId, setApprovingId] = useState<string | null>(null);

    const handleApproveTask = async (taskId: string, status: string, comment?: string, publishDirectly: boolean = false) => {
        if (approvingRef.current.has(taskId)) return;  // already in flight for this task
        approvingRef.current.add(taskId);
        setApprovingId(taskId);
        const fallback = status === 'approved'
            ? (publishDirectly ? `Approved and published directly by ${user?.full_name}` : `Approved by ${user?.full_name}`)
            : `Changes requested by ${user?.full_name}`;
        try {
            await tasksApi.approve(taskId, { status, comment: (comment && comment.trim()) || fallback, publish_directly: publishDirectly });
            if (status === 'approved') {
                if (publishDirectly) {
                    toast.success('Approved and published directly live to LinkedIn!');
                } else {
                    toast.success('Approved — agent can publish');
                }
            } else {
                toast.success('Sent back to the agent for changes');
            }
            setReviewComments(prev => { const n = { ...prev }; delete n[taskId]; return n; });
            loadAll();
        } catch (err: any) {
            toast.error(err?.response?.data?.detail || 'Action failed');
        } finally {
            approvingRef.current.delete(taskId);
            setApprovingId(prev => (prev === taskId ? null : prev));
        }
    };



    // Heatmap rendering
    // const maxEngagement = Math.max(...heatmap.map(c => c.engagement), 1);
    // const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    

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
                        <button className="btn btn-primary" onClick={() => setShowAddTask(true)} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Plus size={16} /> Add Task
                        </button>
                    </div>

                    {/* Bulk selection bar */}
                    {selectedIds.length > 0 && (
                        <div className="glass-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', marginBottom: 16, border: '1px solid var(--accent)', background: 'var(--accent-glow)' }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{selectedIds.length} task{selectedIds.length > 1 ? 's' : ''} selected</span>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button className="btn btn-sm btn-ghost" onClick={() => setSelectedIds([])}>Clear</button>
                                <button className="btn btn-sm btn-danger" onClick={handleBulkDelete} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <Trash2 size={14} /> Delete selected
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Admin: Pending approvals */}
                    {isAdmin && pendingTasks.length > 0 && (
                        <div className="chart-container" style={{ marginBottom: 20 }}>
                            <div className="chart-title">⏳ Pending Approvals ({pendingTasks.length})</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {pendingTasks.map(t => (
                                    <div key={t.id} className="glass-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                                        <div>
                                            <div style={{ fontWeight: 600, fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                                                {t.title}
                                                {t.priority && (
                                                    <span style={{
                                                        fontSize: '0.62rem',
                                                        fontWeight: 700,
                                                        padding: '1px 6px',
                                                        borderRadius: '12px',
                                                        textTransform: 'uppercase',
                                                        border: '1px solid',
                                                        background: t.priority === 'high' ? 'rgba(239, 68, 68, 0.12)' : t.priority === 'medium' ? 'rgba(234, 179, 8, 0.12)' : 'rgba(34, 197, 94, 0.12)',
                                                        color: t.priority === 'high' ? 'var(--danger)' : t.priority === 'medium' ? 'var(--warning)' : 'var(--success)',
                                                        borderColor: t.priority === 'high' ? 'rgba(239, 68, 68, 0.25)' : t.priority === 'medium' ? 'rgba(234, 179, 8, 0.25)' : 'rgba(34, 197, 94, 0.25)'
                                                    }}>
                                                        {t.priority}
                                                    </span>
                                                )}
                                                <span className="badge badge-muted" style={{ fontSize: '0.62rem', margin: 0 }}>{t.region}</span>
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>{t.description}</div>
                                        </div>
                                        {t.post && (
                                            <div style={{
                                                padding: '12px',
                                                background: 'rgba(255, 255, 255, 0.03)',
                                                borderRadius: '8px',
                                                borderLeft: '3px solid var(--accent)',
                                                fontSize: '0.8rem',
                                            }}>
                                                <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>Draft Content to Review:</div>
                                                <div style={{ whiteSpace: 'pre-wrap', color: 'var(--text-secondary)' }}>{t.post.content}</div>
                                                {t.post.image_url && (
                                                    <img src={t.post.image_url} alt="Draft attachment" style={{ marginTop: 10, maxWidth: '100%', maxHeight: 240, borderRadius: 8, objectFit: 'cover', display: 'block' }} />
                                                )}
                                                {(t.post.tone || t.post.hashtags) && (
                                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 8, display: 'flex', gap: 10 }}>
                                                        {t.post.tone && <span>Tone: <strong>{t.post.tone}</strong></span>}
                                                        {t.post.hashtags && <span>Hashtags: <strong>{t.post.hashtags}</strong></span>}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        <textarea
                                            className="textarea"
                                            placeholder="Optional: describe the changes you want. Sent to the agent when you request changes…"
                                            value={reviewComments[t.id] || ''}
                                            onChange={e => setReviewComments(prev => ({ ...prev, [t.id]: e.target.value }))}
                                            style={{ minHeight: 54, fontSize: '0.8rem' }}
                                        />
                                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                                            <button className="btn btn-sm" disabled={approvingId === t.id} style={{ background: 'rgba(245,158,11,0.15)', color: 'var(--warning)', border: '1px solid rgba(245,158,11,0.3)' }} onClick={() => handleApproveTask(t.id, 'rejected', reviewComments[t.id])}>
                                                ↩ Request Changes
                                            </button>
                                            <button className="btn btn-sm" disabled={approvingId === t.id} style={{ background: 'rgba(16,185,129,0.15)', color: 'var(--success)', border: '1px solid rgba(16,185,129,0.3)' }} onClick={() => handleApproveTask(t.id, 'approved', reviewComments[t.id], false)}>
                                                ✓ Approve
                                            </button>
                                            {t.post && (
                                                <button className="btn btn-sm btn-primary" disabled={approvingId === t.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }} onClick={() => handleApproveTask(t.id, 'approved', reviewComments[t.id], true)}>
                                                    {approvingId === t.id ? '⏳ Publishing…' : '🚀 Approve & Publish'}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Active tasks */}
                    {(() => {
                        // Agents also need to see their drafts awaiting review / sent back for revision.
                        const activeTasks = tasks.filter(t =>
                            ['active', 'in_progress'].includes(t.status) ||
                            (!isAdmin && ['pending_approval', 'rejected'].includes(t.status))
                        );
                        const completedTasks = tasks.filter(t => t.status === 'completed');

                        return (
                            <>
                                <div className="chart-container">
                                    <div className="chart-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <span>📅 Active Tasks ({activeTasks.length})</span>
                                        {(() => {
                                            const deletable = activeTasks.filter(canDelete);
                                            if (deletable.length === 0) return null;
                                            const allSelected = deletable.every(t => selectedIds.includes(t.id));
                                            return (
                                                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', fontWeight: 500, color: 'var(--text-muted)', cursor: 'pointer' }}>
                                                    <input type="checkbox" checked={allSelected}
                                                        onChange={() => setSelectedIds(prev => allSelected
                                                            ? prev.filter(id => !deletable.some(t => t.id === id))
                                                            : Array.from(new Set([...prev, ...deletable.map(t => t.id)])))} />
                                                    Select all
                                                </label>
                                            );
                                        })()}
                                    </div>
                                    {activeTasks.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                                            <CheckCircle size={40} style={{ marginBottom: 12, opacity: 0.3 }} />
                                            <p>No active tasks — you're all caught up!</p>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                            {activeTasks.map(t => {
                                                const isSelected = selectedTaskId === t.id;
                                                const isAssigned = t.assignments?.some(a => a.agent_id === user?.id);
                                                const isClaimedByMe = t.claimed_by_id === user?.id;
                                                const isClaimedByOther = t.claimed_by_id && t.claimed_by_id !== user?.id;

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
                                                        {canDelete(t) && (
                                                            <input type="checkbox" checked={selectedIds.includes(t.id)} onChange={() => toggleSelect(t.id)} title="Select for bulk delete" style={{ width: 16, height: 16, marginTop: 3, cursor: 'pointer', flexShrink: 0 }} />
                                                        )}
                                                        <div className={`status-dot ${t.status === 'in_progress' ? 'dot-active' : 'dot-draft'}`} style={{ marginTop: 4 }} />
                                                        <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => setDetailTaskId(t.id)} title="Click to view the post">
                                                            <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>{t.title}<Eye size={13} style={{ opacity: 0.4 }} /></div>
                                                            {t.description && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 6 }}>{t.description}</div>}
                                                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                                                                <span className="badge badge-muted">{t.region}</span>
                                                                {t.priority && (
                                                                    <span style={{
                                                                        fontSize: '0.62rem',
                                                                        fontWeight: 700,
                                                                        padding: '2px 8px',
                                                                        borderRadius: '12px',
                                                                        textTransform: 'uppercase',
                                                                        border: '1px solid',
                                                                        background: t.priority === 'high' ? 'rgba(239, 68, 68, 0.12)' : t.priority === 'medium' ? 'rgba(234, 179, 8, 0.12)' : 'rgba(34, 197, 94, 0.12)',
                                                                        color: t.priority === 'high' ? 'var(--danger)' : t.priority === 'medium' ? 'var(--warning)' : 'var(--success)',
                                                                        borderColor: t.priority === 'high' ? 'rgba(239, 68, 68, 0.25)' : t.priority === 'medium' ? 'rgba(234, 179, 8, 0.25)' : 'rgba(34, 197, 94, 0.25)'
                                                                    }}>
                                                                        {t.priority}
                                                                    </span>
                                                                )}
                                                                {t.due_date && <span className={`badge ${new Date(t.due_date) < new Date() ? 'badge-danger' : 'badge-accent'}`}>Due: {new Date(t.due_date).toLocaleDateString()}</span>}

                                                                {(() => {
                                                                    // One badge that reflects exactly where the task is in the workflow.
                                                                    if (t.status === 'pending_approval')
                                                                        return <span className="badge badge-warning" style={{ fontSize: '0.68rem', fontWeight: 600 }}>⏳ Awaiting admin approval</span>;
                                                                    if (t.post?.status === 'rejected')
                                                                        return <span className="badge badge-danger" style={{ fontSize: '0.68rem', fontWeight: 600 }}>↩ Needs revision</span>;
                                                                    if (t.post?.status === 'approved')
                                                                        return <span className="badge badge-success" style={{ fontSize: '0.68rem', fontWeight: 600 }}>✅ Approved · ready to publish</span>;
                                                                    if (t.claimed_by_id)
                                                                        return <span className="badge badge-purple" style={{ fontSize: '0.68rem', fontWeight: 600 }}>{isClaimedByMe ? '🔧 In progress (you)' : `🔒 Taken by ${t.claimed_by_name || 'other agent'}`}</span>;
                                                                    return <span className="badge badge-gray" style={{ fontSize: '0.68rem' }}>📥 Unclaimed (assigned)</span>;
                                                                })()}
                                                            </div>

                                                            {/* Manager feedback when a draft was sent back for revision */}
                                                            {t.post?.status === 'rejected' && t.post?.review_comment && !isAdmin && (
                                                                <div style={{ marginTop: 8, padding: '8px 10px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 6, fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                                                                    <strong style={{ color: 'var(--danger)' }}>Revision requested:</strong> {t.post.review_comment}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                                                            {/* Accept Task button */}
                                                            {!t.claimed_by_id && isAssigned && !isAdmin && (
                                                                <button
                                                                    className="btn btn-sm btn-primary"
                                                                    onClick={() => handleAcceptTask(t.id)}
                                                                    style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                                                                >
                                                                    Accept Task
                                                                </button>
                                                            )}

                                                            {/* Write a first draft (no post yet) */}
                                                            {isClaimedByMe && !isAdmin && t.status !== 'pending_approval' && !t.post && (
                                                                <button
                                                                    className="btn btn-sm"
                                                                    onClick={() => {
                                                                        setSelectedTaskId(t.id);
                                                                        setPrompt(t.title + (t.description ? `\n\nContext:\n${t.description}` : ''));
                                                                        setTab('composer');
                                                                    }}
                                                                    style={{ background: 'var(--accent-glow)', color: 'var(--accent)', border: '1px solid var(--accent)', display: 'flex', alignItems: 'center', gap: 4 }}
                                                                >
                                                                    <Sparkles size={13} /> Write Post
                                                                </button>
                                                            )}

                                                            {/* Edit a draft that was sent back for revision (saving resubmits it) */}
                                                            {isClaimedByMe && !isAdmin && t.post?.status === 'rejected' && (
                                                                <button
                                                                    className="btn btn-sm"
                                                                    onClick={() => openPostForEditing(t)}
                                                                    style={{ background: 'var(--accent-glow)', color: 'var(--accent)', border: '1px solid var(--accent)', display: 'flex', alignItems: 'center', gap: 4 }}
                                                                >
                                                                    <Sparkles size={13} /> Edit &amp; resubmit
                                                                </button>
                                                            )}

                                                            {/* Agent: draft is under admin review */}
                                                            {!isAdmin && isClaimedByMe && t.status === 'pending_approval' && (
                                                                <span className="badge badge-warning" style={{ fontSize: '0.68rem' }}>Under review</span>
                                                            )}

                                                            {/* Admin: read-only lifecycle indicator (completion is publish-gated — the
                                                                task finishes when the agent publishes the approved post) */}
                                                            {isAdmin && (
                                                                <span className="badge" style={{
                                                                    background: t.post?.status === 'approved' ? 'rgba(16,185,129,0.15)' : 'var(--bg-tertiary)',
                                                                    color: t.post?.status === 'approved' ? 'var(--success)' : 'var(--text-muted)',
                                                                    fontSize: '0.68rem', fontWeight: 600
                                                                }}>
                                                                    {t.post?.status === 'approved'
                                                                        ? 'Approved · awaiting publish'
                                                                        : t.post?.status === 'in_review'
                                                                            ? 'Draft submitted'
                                                                            : t.claimed_by_id ? 'In progress' : 'Awaiting agent'}
                                                                </span>
                                                            )}

                                                            {/* Publish button for agent if task's post is approved */}
                                                            {t.post?.status === 'approved' && isClaimedByMe && !isAdmin && (
                                                                <button
                                                                    className="btn btn-sm btn-success"
                                                                    onClick={() => {
                                                                        setSelectedTaskId(t.id);
                                                                        setTab('composer');
                                                                        if (t.post) {
                                                                            setPreviewContent(t.post.content);
                                                                            setGeneratedContent(t.post.content);
                                                                            setTone(t.post.tone || 'professional');
                                                                            setHashtags(t.post.hashtags || '');
                                                                        }
                                                                    }}
                                                                    style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                                                                >
                                                                    Publish
                                                                </button>
                                                            )}

                                                            {/* Agent can edit an approved draft before publishing — saving sends it back for review */}
                                                            {t.post?.status === 'approved' && isClaimedByMe && !isAdmin && (
                                                                <button
                                                                    className="btn btn-sm btn-ghost"
                                                                    onClick={() => openPostForEditing(t)}
                                                                    title="Edit the post — saving sends it back to the admin for review"
                                                                    style={{ color: 'var(--accent)', border: '1px solid var(--accent)' }}
                                                                >
                                                                    ✏️ Edit
                                                                </button>
                                                            )}

                                                            {isClaimedByOther && !isAdmin && (
                                                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontStyle: 'italic', paddingLeft: 6 }}>
                                                                    Locked
                                                                </span>
                                                            )}

                                                            {isAdmin && (
                                                                <button
                                                                    className="btn btn-sm btn-ghost"
                                                                    style={{ color: 'var(--danger)', padding: 6 }}
                                                                    onClick={() => handleRemoveTask(t.id)}
                                                                    title="Delete Task"
                                                                >
                                                                    <Trash2 size={15} />
                                                                </button>
                                                            )}
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
                                                        {canDelete(t) && (
                                                            <input type="checkbox" checked={selectedIds.includes(t.id)} onChange={() => toggleSelect(t.id)} title="Select for bulk delete" style={{ width: 16, height: 16, marginTop: 3, cursor: 'pointer', flexShrink: 0 }} />
                                                        )}
                                                        <div className="status-dot dot-completed" style={{ marginTop: 4 }} />
                                                        <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => setDetailTaskId(t.id)} title="Click to view the post">
                                                            <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: 4, textDecoration: 'line-through', display: 'flex', alignItems: 'center', gap: 6 }}>{t.title}<Eye size={13} style={{ opacity: 0.4, textDecoration: 'none' }} /></div>
                                                            {t.description && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 6 }}>{t.description}</div>}
                                                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                                                <span className="badge badge-muted">{t.region}</span>
                                                                {t.priority && (
                                                                    <span style={{
                                                                        fontSize: '0.62rem',
                                                                        fontWeight: 700,
                                                                        padding: '2px 8px',
                                                                        borderRadius: '12px',
                                                                        textTransform: 'uppercase',
                                                                        border: '1px solid',
                                                                        background: t.priority === 'high' ? 'rgba(239, 68, 68, 0.12)' : t.priority === 'medium' ? 'rgba(234, 179, 8, 0.12)' : 'rgba(34, 197, 94, 0.12)',
                                                                        color: t.priority === 'high' ? 'var(--danger)' : t.priority === 'medium' ? 'var(--warning)' : 'var(--success)',
                                                                        borderColor: t.priority === 'high' ? 'rgba(239, 68, 68, 0.25)' : t.priority === 'medium' ? 'rgba(234, 179, 8, 0.25)' : 'rgba(34, 197, 94, 0.25)'
                                                                    }}>
                                                                        {t.priority}
                                                                    </span>
                                                                )}
                                                                {t.due_date && <span className="badge badge-muted">Due: {new Date(t.due_date).toLocaleDateString()}</span>}
                                                            </div>
                                                        </div>
                                                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                                            {isAdmin && (
                                                                <button
                                                                    className="btn btn-sm btn-ghost"
                                                                    style={{ color: 'var(--danger)', padding: 6 }}
                                                                    onClick={() => handleRemoveTask(t.id)}
                                                                    title="Delete Task"
                                                                >
                                                                    <Trash2 size={15} />
                                                                </button>
                                                            )}
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

                    {/* Task Detail — post preview visible to BOTH admins and agents */}
                    {detailTaskId && (() => {
                        const t = tasks.find(x => x.id === detailTaskId);
                        if (!t) return null;
                        const post = t.post;
                        const isClaimedByMe = t.claimed_by_id === user?.id;
                        const isAssigned = t.assignments?.some(a => a.agent_id === user?.id);
                        const stageBadge = (() => {
                            if (t.status === 'completed') return <span className="badge badge-success">✅ Completed</span>;
                            if (t.status === 'pending_approval') return <span className="badge badge-warning">⏳ Awaiting admin approval</span>;
                            if (post?.status === 'rejected') return <span className="badge badge-danger">↩ Needs revision</span>;
                            if (post?.status === 'approved') return <span className="badge badge-success">✅ Approved · ready to publish</span>;
                            if (t.claimed_by_id) return <span className="badge badge-purple">{isClaimedByMe ? '🔧 In progress (you)' : `🔒 Taken by ${t.claimed_by_name || 'agent'}`}</span>;
                            return <span className="badge badge-gray">📥 Unclaimed</span>;
                        })();
                        return (
                            <div className="modal-overlay" onClick={() => setDetailTaskId(null)}>
                                <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 620, width: '100%', maxHeight: '88vh', overflowY: 'auto' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
                                        <div>
                                            <h3 style={{ margin: 0 }}>{t.title}</h3>
                                            {t.description && <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 4 }}>{t.description}</div>}
                                            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                                                <span className="badge badge-muted">{t.region}</span>
                                                {t.due_date && <span className="badge badge-accent">Due: {new Date(t.due_date).toLocaleDateString()}</span>}
                                                {stageBadge}
                                            </div>
                                        </div>
                                        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setDetailTaskId(null)}><X size={16} /></button>
                                    </div>

                                    {post?.status === 'rejected' && post?.review_comment && (
                                        <div style={{ marginBottom: 12, padding: '10px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                            <strong style={{ color: 'var(--danger)' }}>Revision requested:</strong> {post.review_comment}
                                        </div>
                                    )}

                                    {post ? (
                                        <>
                                            <LinkedInPreview content={post.content} hashtags={post.hashtags || ''} imageUrl={post.image_url} />
                                            {post.tone && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 8 }}>Tone: <strong>{post.tone}</strong></div>}
                                        </>
                                    ) : (
                                        <div style={{ textAlign: 'center', padding: '28px 16px', color: 'var(--text-muted)', border: '2px dashed var(--border)', borderRadius: 8 }}>
                                            No draft has been written for this task yet.
                                        </div>
                                    )}

                                    {/* Admin: review actions when a draft is awaiting approval */}
                                    {isAdmin && post && post.status === 'in_review' && (
                                        <div style={{ marginTop: 14 }}>
                                            <textarea className="textarea" placeholder="Optional: describe the changes you want…" value={reviewComments[t.id] || ''} onChange={e => setReviewComments(prev => ({ ...prev, [t.id]: e.target.value }))} style={{ minHeight: 54, fontSize: '0.8rem' }} />
                                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8, flexWrap: 'wrap' }}>
                                                <button className="btn btn-sm" style={{ background: 'rgba(245,158,11,0.15)', color: 'var(--warning)', border: '1px solid rgba(245,158,11,0.3)' }} onClick={() => { handleApproveTask(t.id, 'rejected', reviewComments[t.id], false); setDetailTaskId(null); }}>↩ Request Changes</button>
                                                <button className="btn btn-sm" style={{ background: 'rgba(16,185,129,0.15)', color: 'var(--success)', border: '1px solid rgba(16,185,129,0.3)' }} onClick={() => { handleApproveTask(t.id, 'approved', reviewComments[t.id], false); setDetailTaskId(null); }}>✓ Approve</button>
                                                <button className="btn btn-sm btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 4 }} onClick={() => { handleApproveTask(t.id, 'approved', reviewComments[t.id], true); setDetailTaskId(null); }}>🚀 Approve &amp; Publish</button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Agent actions */}
                                    {!isAdmin && (
                                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14, flexWrap: 'wrap' }}>
                                            {!t.claimed_by_id && isAssigned && t.status === 'active' && (
                                                <button className="btn btn-sm btn-primary" onClick={() => { handleAcceptTask(t.id); setDetailTaskId(null); }}>Accept Task</button>
                                            )}
                                            {isClaimedByMe && post && post.status === 'approved' && (
                                                <>
                                                    <button className="btn btn-sm btn-success" onClick={() => { setSelectedTaskId(t.id); setTab('composer'); setDetailTaskId(null); }}>Publish</button>
                                                    <button className="btn btn-sm btn-secondary" style={{ color: 'var(--accent)' }} onClick={() => openPostForEditing(t)}>✏️ Edit</button>
                                                </>
                                            )}
                                            {isClaimedByMe && t.status !== 'pending_approval' && post?.status === 'rejected' && (
                                                <button className="btn btn-sm" style={{ background: 'var(--accent-glow)', color: 'var(--accent)', border: '1px solid var(--accent)', display: 'flex', alignItems: 'center', gap: 4 }} onClick={() => openPostForEditing(t)}>
                                                    <Sparkles size={13} /> Edit &amp; resubmit
                                                </button>
                                            )}
                                            {isClaimedByMe && t.status !== 'pending_approval' && !post && (
                                                <button className="btn btn-sm" style={{ background: 'var(--accent-glow)', color: 'var(--accent)', border: '1px solid var(--accent)', display: 'flex', alignItems: 'center', gap: 4 }} onClick={() => { setSelectedTaskId(t.id); setPrompt(t.title + (t.description ? `\n\nContext:\n${t.description}` : '')); setTab('composer'); setDetailTaskId(null); }}>
                                                    <Sparkles size={13} /> Write Post
                                                </button>
                                            )}
                                            {isClaimedByMe && t.status === 'pending_approval' && (
                                                <span className="badge badge-warning">Under review</span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
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

                                    {/* Priority & Region row */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                        <div>
                                            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6, letterSpacing: '0.05em' }}>TASK PRIORITY</label>
                                            <div style={{ display: 'flex', gap: 6 }}>
                                                {[
                                                    { value: 'low', label: '🟢 Low', activeColor: 'rgba(34, 197, 94, 0.15)', borderColor: 'var(--success)' },
                                                    { value: 'medium', label: '🟡 Medium', activeColor: 'rgba(234, 179, 8, 0.15)', borderColor: 'var(--warning)' },
                                                    { value: 'high', label: '🔴 High', activeColor: 'rgba(239, 68, 68, 0.15)', borderColor: 'var(--danger)' }
                                                ].map(p => (
                                                    <button
                                                        key={p.value}
                                                        type="button"
                                                        className="btn btn-sm"
                                                        onClick={() => setNewTask(prev => ({ ...prev, priority: p.value }))}
                                                        style={{
                                                            flex: 1,
                                                            fontSize: '0.72rem',
                                                            background: newTask.priority === p.value ? p.activeColor : 'var(--surface)',
                                                            color: newTask.priority === p.value ? 'var(--text-primary)' : 'var(--text-secondary)',
                                                            border: `1px solid ${newTask.priority === p.value ? p.borderColor : 'var(--border)'}`,
                                                            fontWeight: newTask.priority === p.value ? 700 : 500,
                                                            padding: '4px 6px'
                                                        }}
                                                    >
                                                        {p.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <div>
                                            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6, letterSpacing: '0.05em' }}>TARGET REGION</label>
                                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                                {[
                                                    { value: 'Global', label: '🌐 Global' },
                                                    { value: 'India', label: '🇮🇳 India' },
                                                    { value: 'USA', label: '🇺🇸 USA' },
                                                    { value: 'Indonesia', label: '🇮🇩 Indo' }
                                                ].map(r => (
                                                    <button
                                                        key={r.value}
                                                        type="button"
                                                        className="btn btn-sm"
                                                        onClick={() => setNewTask(prev => ({ ...prev, region: r.value }))}
                                                        style={{
                                                            flex: '1 1 auto',
                                                            fontSize: '0.72rem',
                                                            background: newTask.region === r.value ? 'var(--accent-glow)' : 'var(--surface)',
                                                            color: newTask.region === r.value ? 'var(--accent)' : 'var(--text-secondary)',
                                                            border: `1px solid ${newTask.region === r.value ? 'var(--accent)' : 'var(--border)'}`,
                                                            fontWeight: newTask.region === r.value ? 700 : 500,
                                                            padding: '4px 6px'
                                                        }}
                                                    >
                                                        {r.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Due Date & Assignees */}
                                    <div className="grid-2">
                                        <div>
                                            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6, letterSpacing: '0.05em' }}>DUE DATE</label>
                                            <input className="input" type="datetime-local" value={newTask.due_date} onChange={e => setNewTask(p => ({ ...p, due_date: e.target.value }))} style={{ fontSize: '0.8rem' }} />
                                        </div>

                                        {isAdmin && (
                                            <div>
                                                <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6, letterSpacing: '0.05em' }}>ASSIGN TO AGENTS</label>
                                                <div style={{
                                                    maxHeight: '90px',
                                                    overflowY: 'auto',
                                                    background: 'var(--surface)',
                                                    border: '1px solid var(--border)',
                                                    borderRadius: '8px',
                                                    padding: '6px 10px',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    gap: '6px'
                                                }}>
                                                    {agents.map(a => (
                                                        <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', cursor: 'pointer', color: 'var(--text-primary)' }}>
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedAgentIds.includes(a.id)}
                                                                onChange={(e) => {
                                                                    if (e.target.checked) {
                                                                        setSelectedAgentIds([...selectedAgentIds, a.id]);
                                                                    } else {
                                                                        setSelectedAgentIds(selectedAgentIds.filter(id => id !== a.id));
                                                                    }
                                                                }}
                                                            />
                                                            {a.full_name} ({a.region})
                                                        </label>
                                                    ))}
                                                    {agents.length === 0 && (
                                                        <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>No agents available</div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Recurrence Setup */}
                                    <div className="glass-card" style={{ padding: 12 }}>
                                        <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 8, letterSpacing: '0.05em' }}>🔁 RECURRENCE PLANNER</label>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                                            <div>
                                                <label style={{ fontSize: '0.62rem', color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>REPEAT PATTERN</label>
                                                <select className="select" value={taskRecurrence.type}
                                                    onChange={e => setTaskRecurrence(p => ({ ...p, type: e.target.value as RichRecurrenceType }))} style={{ fontSize: '0.78rem' }}>
                                                    {RICH_RECURRENCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                                </select>
                                            </div>
                                            {(taskRecurrence.type === 'weekly' || taskRecurrence.type === 'biweekly') && (
                                                <div>
                                                    <label style={{ fontSize: '0.62rem', color: 'var(--text-muted)', display: 'block', marginBottom: 2, letterSpacing: '0.05em' }}>REPEAT ON DAYS</label>
                                                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                                        {[
                                                            { value: '1', short: 'M', label: 'Mon' },
                                                            { value: '2', short: 'T', label: 'Tue' },
                                                            { value: '3', short: 'W', label: 'Wed' },
                                                            { value: '4', short: 'T', label: 'Thu' },
                                                            { value: '5', short: 'F', label: 'Fri' },
                                                            { value: '6', short: 'S', label: 'Sat' },
                                                            { value: '0', short: 'S', label: 'Sun' },
                                                        ].map(d => {
                                                            const currentDays = taskRecurrence.weeklyDays || [taskRecurrence.weeklyDay || '1'];
                                                            const active = currentDays.includes(d.value);
                                                            return (
                                                                <button
                                                                    key={d.value}
                                                                    type="button"
                                                                    className="btn btn-sm"
                                                                    title={d.label}
                                                                    onClick={() => {
                                                                        let nextDays = [...currentDays];
                                                                        if (active) {
                                                                            if (nextDays.length > 1) {
                                                                                nextDays = nextDays.filter(x => x !== d.value);
                                                                            }
                                                                        } else {
                                                                            nextDays.push(d.value);
                                                                        }
                                                                        setTaskRecurrence(p => ({
                                                                            ...p,
                                                                            weeklyDays: nextDays,
                                                                            weeklyDay: nextDays[0] || '1'
                                                                        }));
                                                                    }}
                                                                    style={{
                                                                        minWidth: 22,
                                                                        height: 22,
                                                                        borderRadius: '50%',
                                                                        padding: 0,
                                                                        fontSize: '0.68rem',
                                                                        background: active ? 'var(--accent-glow)' : 'var(--surface)',
                                                                        color: active ? 'var(--accent)' : 'var(--text-secondary)',
                                                                        border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                                                                        fontWeight: active ? 700 : 500,
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        justifyContent: 'center',
                                                                    }}
                                                                >
                                                                    {d.short}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}
                                            {taskRecurrence.type === 'monthly' && (
                                                <div>
                                                    <label style={{ fontSize: '0.62rem', color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>DAY OF MONTH</label>
                                                    <select className="select" title="Repeat on day of month" value={taskRecurrence.monthlyDay}
                                                        onChange={e => setTaskRecurrence(p => ({ ...p, monthlyDay: e.target.value }))} style={{ fontSize: '0.78rem' }}>
                                                        {Array.from({ length: 31 }, (_, idx) => (
                                                            <option key={idx + 1} value={String(idx + 1)}>{idx + 1}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            )}
                                            {taskRecurrence.type === 'custom_interval' && (
                                                <div>
                                                    <label style={{ fontSize: '0.62rem', color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>INTERVAL (DAYS)</label>
                                                    <input className="input" type="number" min={1} max={365}
                                                        value={taskRecurrence.customIntervalDays || 3}
                                                        onChange={e => setTaskRecurrence(p => ({ ...p, customIntervalDays: Math.max(parseInt(e.target.value, 10) || 1, 1) }))} style={{ fontSize: '0.78rem' }} />
                                                </div>
                                            )}
                                        </div>

                                        {taskRecurrence.type !== 'none' && (
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                                                <div>
                                                    <label style={{ fontSize: '0.62rem', color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>MAX OCCURRENCES</label>
                                                    <input className="input" type="number" min={1} max={24} title="Number of occurrences"
                                                        value={taskRecurrence.count}
                                                        onChange={e => setTaskRecurrence(p => ({ ...p, count: Math.min(Math.max(parseInt(e.target.value, 10) || 1, 1), 24) }))} style={{ fontSize: '0.78rem' }} />
                                                </div>
                                                <div>
                                                    <label style={{ fontSize: '0.62rem', color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>STOP UNTIL (END DATE)</label>
                                                    <input className="input" type="date" value={taskRecurrence.endDate || ''}
                                                        onChange={e => setTaskRecurrence(p => ({ ...p, endDate: e.target.value }))} style={{ fontSize: '0.78rem' }} />
                                                </div>
                                            </div>
                                        )}

                                        {taskRecurrence.type !== 'none' && (
                                            <div style={{ fontSize: '0.72rem', color: 'var(--accent)', background: 'var(--accent-glow)', padding: '6px 10px', borderRadius: 6, marginTop: 8, border: '1px dashed var(--accent)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <span>🔄</span>
                                                <span>
                                                    {(() => {
                                                        const times = taskRecurrence.count;
                                                        const endDesc = taskRecurrence.endDate ? ` until ${taskRecurrence.endDate}` : '';
                                                        if (taskRecurrence.type === 'daily') return `Creates up to ${times} daily tasks${endDesc}.`;
                                                        if (taskRecurrence.type === 'weekly' || taskRecurrence.type === 'biweekly') {
                                                            const currentDays = taskRecurrence.weeklyDays || [taskRecurrence.weeklyDay || '1'];
                                                            const dayNames = currentDays.map(val => WEEKDAY_OPTIONS.find(d => d.value === val)?.label || '').filter(Boolean).join(', ');
                                                            const prefix = taskRecurrence.type === 'weekly' ? 'weekly' : 'bi-weekly';
                                                            return `Creates up to ${times} ${prefix} tasks on ${dayNames}${endDesc}.`;
                                                        }
                                                        if (taskRecurrence.type === 'monthly') return `Creates up to ${times} monthly tasks on day ${taskRecurrence.monthlyDay}${endDesc}.`;
                                                        if (taskRecurrence.type === 'custom_interval') return `Creates up to ${times} tasks repeating every ${taskRecurrence.customIntervalDays} days${endDesc}.`;
                                                        return '';
                                                    })()}
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Action buttons */}
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
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
                        <div style={{ animation: 'fadeIn 0.25s ease-in-out' }}>
                            {selectedTaskId ? (() => {
                                const activeTask = tasks.find(t => t.id === selectedTaskId);
                                if (!activeTask) return null;
                                const post = activeTask.post;
                                if (!post) return <div className="text-center py-8">Loading post draft...</div>;

                                const filteredAgents = agents.filter(a => 
                                    !employeeSearch || a.full_name.toLowerCase().includes(employeeSearch.toLowerCase()) || (a.region && a.region.toLowerCase().includes(employeeSearch.toLowerCase()))
                                );

                                const engagement = post.employee_engagement || {};

                                return (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                        {/* Header Bar */}
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 12 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                <button
                                                    className="btn btn-secondary btn-sm"
                                                    onClick={() => { setSelectedTaskId(null); setTab('tasks'); }}
                                                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600 }}
                                                >
                                                    ← Back to Tasks
                                                </button>
                                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                                    <span className="badge badge-accent" style={{ textTransform: 'uppercase', fontSize: '0.68rem', fontWeight: 600 }}>
                                                        {imageUrl ? '🖼️ Media Post' : '📝 Text Post'}
                                                    </span>
                                                    <span className="badge badge-purple" style={{ textTransform: 'uppercase', fontSize: '0.68rem', fontWeight: 600 }}>
                                                        {post.tone || tone}
                                                    </span>
                                                    <span className="badge badge-gray" style={{ textTransform: 'uppercase', fontSize: '0.68rem', fontWeight: 600 }}>
                                                        {(post.post_type || postType).replace('_', ' ')}
                                                    </span>
                                                    <span className="badge badge-muted" style={{ textTransform: 'uppercase', fontSize: '0.68rem', fontWeight: 600 }}>
                                                        {activeTask.region}
                                                    </span>
                                                </div>
                                            </div>
                                            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: post.status === 'approved' ? 'var(--success)' : post.status === 'published' ? 'var(--info)' : 'var(--accent)' }}>
                                                Status: {post.status.toUpperCase().replace('_', ' ')}
                                            </div>
                                        </div>

                                        {/* Two-column layout — same as generic composer */}
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 18, alignItems: 'start' }}>

                                            {/* LEFT COLUMN */}
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

                                                {/* Settings Card: POST TYPE + TONE + HASHTAGS */}
                                                <div className="glass-card" style={{ padding: 16 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                                                        <Sparkles size={15} color="var(--accent)" />
                                                        <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>✨ AI Post Composer</span>
                                                    </div>

                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                                                        <div>
                                                            <label style={{ fontSize: '0.67rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4, letterSpacing: '0.06em' }}>POST TYPE</label>
                                                            <select className="select" value={postType} onChange={e => setPostType(e.target.value)} style={{ fontSize: '0.8rem' }}>
                                                                {POST_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ').toUpperCase()}</option>)}
                                                            </select>
                                                        </div>
                                                        <div>
                                                            <label style={{ fontSize: '0.67rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4, letterSpacing: '0.06em' }}>TONE</label>
                                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                                                {TONES.map(t => (
                                                                    <button key={t} className="btn btn-sm" onClick={() => setTone(t)} style={{ background: tone === t ? 'var(--accent-glow)' : 'var(--surface)', color: tone === t ? 'var(--accent)' : 'var(--text-secondary)', border: `1px solid ${tone === t ? 'var(--accent)' : 'var(--border)'}`, fontSize: '0.67rem', padding: '2px 7px' }}>
                                                                        {t}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div>
                                                        <label style={{ fontSize: '0.67rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4, letterSpacing: '0.06em' }}>HASHTAGS</label>
                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                                                            {['#Hiring', '#GOrecruitAI', '#HRTech', '#Jobs', '#AIRecruitment'].map(h => (
                                                                <button key={h} className="btn btn-sm btn-ghost" onClick={() => setHashtags(p => p.includes(h) ? p.replace(h, '').trim() : `${p} ${h}`.trim())} style={{ fontSize: '0.65rem', padding: '2px 7px', background: hashtags.includes(h) ? 'var(--accent-glow)' : undefined, color: hashtags.includes(h) ? 'var(--accent)' : undefined }}>
                                                                    {h}
                                                                </button>
                                                            ))}
                                                        </div>
                                                        <input className="input" placeholder="Add custom hashtags..." value={hashtags} onChange={e => setHashtags(e.target.value)} style={{ fontSize: '0.8rem' }} />
                                                    </div>
                                                </div>

                                                {/* AI Mode card: DeepSeek Generate / Write Manually */}
                                                <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
                                                    <div style={{ display: 'flex' }}>
                                                        <button
                                                            className={`btn btn-sm ${writeMode === 'ai' ? 'btn-primary' : 'btn-ghost'}`}
                                                            onClick={() => setWriteMode('ai')}
                                                            style={{ flex: 1, borderRadius: 0, borderRight: '1px solid var(--border)', padding: '10px 14px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                                                        >
                                                            <Sparkles size={13} /> ✨ Generate with DeepSeek
                                                        </button>
                                                        <button
                                                            className={`btn btn-sm ${writeMode === 'manual' ? 'btn-primary' : 'btn-ghost'}`}
                                                            onClick={() => setWriteMode('manual')}
                                                            style={{ flex: 1, borderRadius: 0, padding: '10px 14px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                                                        >
                                                            <Edit3 size={13} /> ✏️ Write Manually
                                                        </button>
                                                    </div>

                                                    <div style={{ padding: 14 }}>
                                                        {writeMode === 'ai' ? (
                                                            <>
                                                                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
                                                                    {EMOJIS.map(e => <button key={e} className="btn btn-sm btn-ghost" onClick={() => setPrompt(p => p + e)} style={{ padding: '3px 6px', fontSize: '0.88rem' }}>{e}</button>)}
                                                                </div>
                                                                <div style={{ marginBottom: 10 }}>
                                                                    <label style={{ fontSize: '0.67rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4, letterSpacing: '0.06em' }}>PROMPT / TOPIC</label>
                                                                    <textarea className="textarea" placeholder="Describe what you want to post about..." value={prompt} onChange={e => setPrompt(e.target.value)} style={{ minHeight: 88, fontSize: '0.83rem' }} />
                                                                </div>
                                                                <div style={{ display: 'flex', gap: 8 }}>
                                                                    <button className="btn btn-primary" onClick={handleGenerateAI} disabled={generatingAI || !prompt} style={{ flex: 1, fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                                                        <Sparkles size={13} /> {generatingAI ? 'Generating...' : '✨ Generate with DeepSeek'}
                                                                    </button>
                                                                    <button className="btn btn-secondary" onClick={handleEnhanceAI} disabled={enhancingAI || !previewContent} style={{ flex: 1, color: 'var(--accent)', borderColor: 'var(--accent)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                                                        <Sparkles size={13} /> {enhancingAI ? 'Enhancing...' : '💡 Enhance with DeepSeek'}
                                                                    </button>
                                                                </div>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <div style={{ marginBottom: 10 }}>
                                                                    <label style={{ fontSize: '0.67rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4, letterSpacing: '0.06em' }}>POST CONTENT</label>
                                                                    <textarea
                                                                        className="textarea"
                                                                        placeholder="Write your post here... The preview on the right updates as you type."
                                                                        value={previewContent}
                                                                        onChange={e => { setPreviewContent(e.target.value); setManualContent(e.target.value); }}
                                                                        style={{ minHeight: 150, fontSize: '0.85rem' }}
                                                                    />
                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.67rem', color: 'var(--text-muted)', marginTop: 3 }}>
                                                                        <span>{previewContent.length} characters</span>
                                                                        <span>{previewContent.length > 3000 ? '⚠️ Too long' : previewContent.length > 2000 ? '⚡ Long post' : '✅ Good length'}</span>
                                                                    </div>
                                                                </div>
                                                                <button className="btn btn-secondary w-full" onClick={handleEnhanceAI} disabled={enhancingAI || !previewContent} style={{ color: 'var(--accent)', borderColor: 'var(--accent)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                                                    <Sparkles size={13} /> {enhancingAI ? 'Enhancing...' : '✨ Edit & Enhance with DeepSeek'}
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Schedule + Media: side by side */}
                                                <div className="glass-card" style={{ padding: 14 }}>
                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                                        <div>
                                                            <label style={{ fontSize: '0.67rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4, letterSpacing: '0.06em' }}>SCHEDULE POST</label>
                                                            <input className="input" type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} style={{ fontSize: '0.8rem' }} />
                                                        </div>
                                                        <div>
                                                            <label style={{ fontSize: '0.67rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4, letterSpacing: '0.06em' }}>MEDIA (OPTIONAL)</label>
                                                            {imageUrl ? (
                                                                <div style={{ position: 'relative', display: 'inline-block', width: '100%' }}>
                                                                    {/\.(mp4|mov|webm)$/i.test(imageUrl) ? (
                                                                        <video src={imageUrl} controls style={{ maxWidth: '100%', maxHeight: 64, borderRadius: 6, display: 'block' }} />
                                                                    ) : (
                                                                        <img src={imageUrl} alt="attachment" style={{ maxWidth: '100%', maxHeight: 64, borderRadius: 6, border: '1px solid var(--border)', display: 'block', objectFit: 'contain' }} />
                                                                    )}
                                                                    <button className="btn btn-sm btn-ghost" onClick={() => setImageUrl('')} style={{ position: 'absolute', top: 2, right: 2, background: 'rgba(0,0,0,0.6)', color: '#fff', padding: 3 }}>
                                                                        <X size={11} />
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                                                    <label className="btn btn-secondary btn-sm" style={{ cursor: uploadingImage ? 'default' : 'pointer', margin: 0, fontSize: '0.72rem', whiteSpace: 'nowrap' }}>
                                                                        {uploadingImage ? '...' : '📎 Upload'}
                                                                        <input type="file" accept="image/*,video/*" style={{ display: 'none' }} disabled={uploadingImage}
                                                                            onChange={e => { handleImageUpload(e.target.files?.[0] || null); e.currentTarget.value = ''; }} />
                                                                    </label>
                                                                    <input className="input" placeholder="or paste URL" style={{ flex: 1, fontSize: '0.72rem' }}
                                                                        onBlur={e => { const v = e.target.value.trim(); if (v) setImageUrl(v); }} />
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* LinkedIn post link input */}
                                                <div className="glass-card" style={{ padding: 14 }}>
                                                    <h4 style={{ margin: '0 0 8px 0', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6 }}>🔗 LinkedIn Post Link</h4>
                                                    <div style={{ display: 'flex', gap: 8 }}>
                                                        <input
                                                            className="input"
                                                            placeholder="https://www.linkedin.com/feed/update/urn:li:share:..."
                                                            value={editingLinkUrl}
                                                            onChange={e => setEditingLinkUrl(e.target.value)}
                                                            style={{ fontSize: '0.8rem' }}
                                                        />
                                                        <button
                                                            className="btn btn-primary"
                                                            onClick={() => handleSaveLinkedInLink(editingLinkUrl)}
                                                            style={{ fontSize: '0.8rem' }}
                                                        >
                                                            Save
                                                        </button>
                                                    </div>
                                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 6 }}>
                                                        Paste the LinkedIn post URL here to complete the task and enable metrics syncing.
                                                    </div>
                                                </div>

                                                {/* Submit / Publish */}
                                                <div className="glass-card" style={{ padding: 14 }}>
                                                    {isAdmin && (
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                                                            <input type="checkbox" id="publishDirectly" checked={publishDirectly} onChange={e => setPublishDirectly(e.target.checked)} style={{ width: 15, height: 15, cursor: 'pointer' }} />
                                                            <label htmlFor="publishDirectly" style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer' }}>🚀 Publish directly to LinkedIn</label>
                                                        </div>
                                                    )}
                                                    {(() => {
                                                        const isApproved = post.status === 'approved';
                                                        if (isApproved && !isAdmin) {
                                                            return (
                                                                <button className="btn btn-success w-full" onClick={handlePublishLive} disabled={savingPost}
                                                                    style={{ padding: '11px 16px', fontSize: '0.88rem', fontWeight: 700 }}>
                                                                    {savingPost ? 'Publishing...' : '🚀 Publish Live on LinkedIn'}
                                                                </button>
                                                            );
                                                        }
                                                        return (
                                                            <button
                                                                className="btn btn-primary w-full"
                                                                onClick={handlePublishPost}
                                                                disabled={savingPost || !previewContent}
                                                                style={{ padding: '11px 16px', fontSize: '0.88rem', fontWeight: 700 }}
                                                            >
                                                                {savingPost ? 'Processing...' : publishDirectly ? '🚀 Publish Directly to LinkedIn' : isAdmin ? '📤 Save & Approve' : '📤 Submit for Review'}
                                                            </button>
                                                        );
                                                    })()}
                                                </div>

                                                {/* Engagement Metrics Card */}
                                                <div className="glass-card" style={{ padding: 16 }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                                        <h4 style={{ margin: 0, fontSize: '0.85rem' }}>📊 Engagement Metrics</h4>
                                                        <button
                                                            className="btn btn-secondary btn-sm"
                                                            disabled={!post.linkedin_post_id}
                                                            onClick={handleDemoSync}
                                                            style={{ fontSize: '0.75rem', padding: '3px 8px' }}
                                                        >
                                                            Demo Sync
                                                        </button>
                                                    </div>
                                                    <div className="grid-3" style={{ gap: 8 }}>
                                                        <div style={{ background: 'var(--bg-tertiary)', padding: '10px 6px', borderRadius: 8, textAlign: 'center' }}>
                                                            <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontWeight: 600 }}>LINKEDIN LIKES</div>
                                                            <div style={{ fontSize: '1.25rem', fontWeight: 800, marginTop: 2, color: 'var(--accent)' }}>{historyPostMetrics.likes || 0}</div>
                                                        </div>
                                                        <div style={{ background: 'var(--bg-tertiary)', padding: '10px 6px', borderRadius: 8, textAlign: 'center' }}>
                                                            <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontWeight: 600 }}>COMMENTS</div>
                                                            <div style={{ fontSize: '1.25rem', fontWeight: 800, marginTop: 2, color: 'var(--purple)' }}>{historyPostMetrics.comments || 0}</div>
                                                        </div>
                                                        <div style={{ background: 'var(--bg-tertiary)', padding: '10px 6px', borderRadius: 8, textAlign: 'center' }}>
                                                            <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontWeight: 600 }}>SHARES</div>
                                                            <div style={{ fontSize: '1.25rem', fontWeight: 800, marginTop: 2, color: 'var(--teal)' }}>{historyPostMetrics.shares || 0}</div>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Employee engagement card */}
                                                <div className="glass-card" style={{ padding: 16 }}>
                                                    <h4 style={{ margin: '0 0 6px 0', fontSize: '0.85rem' }}>👥 Employee Engagement</h4>
                                                    <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '0 0 10px 0' }}>Tick the actions each employee took on this post:</p>
                                                    
                                                    <div style={{ position: 'relative', marginBottom: 12 }}>
                                                        <input
                                                            className="input"
                                                            placeholder="Search employees..."
                                                            value={employeeSearch}
                                                            onChange={e => setEmployeeSearch(e.target.value)}
                                                            style={{ fontSize: '0.8rem', paddingLeft: 30, height: 'auto', paddingTop: 6, paddingBottom: 6 }}
                                                        />
                                                        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                                    </div>

                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 180, overflowY: 'auto', paddingRight: 4 }}>
                                                        {filteredAgents.map(a => {
                                                            const empEng = engagement[a.id] || { like: false, comment: false, share: false };
                                                            return (
                                                                <div key={a.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', background: 'var(--bg-tertiary)', borderRadius: 6 }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent-glow)', border: '1px solid var(--accent)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.78rem', fontWeight: 'bold' }}>
                                                                            {a.avatar_url ? <img src={a.avatar_url} alt="avatar" style={{ width: '100%', height: '100%', borderRadius: '50%' }} /> : a.full_name[0].toUpperCase()}
                                                                        </div>
                                                                        <div>
                                                                            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>{a.full_name}</div>
                                                                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>· {a.region}</div>
                                                                        </div>
                                                                    </div>
                                                                    <div style={{ display: 'flex', gap: 6 }}>
                                                                        <button 
                                                                            className="btn btn-ghost" 
                                                                            onClick={() => handleToggleEmployeeEngagement(post.id, a.id, 'like', empEng.like)}
                                                                            style={{ padding: '4px 8px', fontSize: '0.75rem', background: empEng.like ? 'var(--success-glow)' : 'transparent', color: empEng.like ? 'var(--success)' : 'var(--text-muted)', border: empEng.like ? '1px solid var(--success)' : '1px solid var(--border)' }}
                                                                            title="Liked"
                                                                        >
                                                                            👍
                                                                        </button>
                                                                        <button 
                                                                            className="btn btn-ghost" 
                                                                            onClick={() => handleToggleEmployeeEngagement(post.id, a.id, 'comment', empEng.comment)}
                                                                            style={{ padding: '4px 8px', fontSize: '0.75rem', background: empEng.comment ? 'var(--warning-glow)' : 'transparent', color: empEng.comment ? 'var(--warning)' : 'var(--text-muted)', border: empEng.comment ? '1px solid var(--warning)' : '1px solid var(--border)' }}
                                                                            title="Commented"
                                                                        >
                                                                            💬
                                                                        </button>
                                                                        <button 
                                                                            className="btn btn-ghost" 
                                                                            onClick={() => handleToggleEmployeeEngagement(post.id, a.id, 'share', empEng.share)}
                                                                            style={{ padding: '4px 8px', fontSize: '0.75rem', background: empEng.share ? 'var(--info-glow)' : 'transparent', color: empEng.share ? 'var(--info)' : 'var(--text-muted)', border: empEng.share ? '1px solid var(--info)' : '1px solid var(--border)' }}
                                                                            title="Shared/Sent"
                                                                        >
                                                                            🔁
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                        {filteredAgents.length === 0 && (
                                                            <div style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', padding: 10 }}>No matching agents found.</div>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Author / who is working on this post */}
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: 'var(--bg-tertiary)', borderRadius: 8, border: '1px solid var(--border)' }}>
                                                    <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--accent-glow)', border: '1px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '0.85rem', color: 'var(--accent)', overflow: 'hidden' }}>
                                                        {post.created_by_avatar ? <img src={post.created_by_avatar} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (post.created_by_name ? post.created_by_name[0] : 'A')}
                                                    </div>
                                                    <div>
                                                        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>Working on this: {post.created_by_name || 'Assigned Agent'}</div>
                                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Role: Agent · Region: {activeTask.region}</div>
                                                    </div>
                                                </div>

                                            </div>

                                            {/* RIGHT COLUMN: LinkedIn Live Preview — sticky */}
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, position: 'sticky', top: 16 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                    <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em' }}>LINKEDIN PREVIEW</div>
                                                    <div style={{ fontSize: '0.63rem', color: 'var(--success)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                                                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)', display: 'inline-block' }} />
                                                        Live
                                                    </div>
                                                </div>

                                                <LinkedInPreview
                                                    content={previewContent}
                                                    hashtags={hashtags}
                                                    imageUrl={imageUrl}
                                                    authorName={post.created_by_name || 'GOrecruitAI'}
                                                    authorAvatar={post.created_by_avatar}
                                                    initialLikes={post.employee_engagement ? Object.values(post.employee_engagement).filter((v: any) => v.like).length : 0}
                                                    initialComments={post.employee_engagement ? Object.values(post.employee_engagement).filter((v: any) => v.comment).length : 0}
                                                    initialShares={post.employee_engagement ? Object.values(post.employee_engagement).filter((v: any) => v.share).length : 0}
                                                    postStatus={post.status}
                                                />
                                                {hashtags && (
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
                                                        {hashtags.split(/\s+/).filter(Boolean).map((h, i) => (
                                                            <span key={i} style={{ color: '#0a66c2', fontSize: '0.73rem', fontWeight: 600, background: 'rgba(10,102,194,0.1)', padding: '2px 9px', borderRadius: 20 }}>
                                                                {h.startsWith('#') ? h : `#${h}`}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })() : (
                                /* Generic post composer layout (when no task is selected) */
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                    {/* Two-column layout */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 18, alignItems: 'start' }}>

                                    {/* LEFT COLUMN */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

                                        {/* Unified Settings Card: POST TYPE + TONE + HASHTAGS */}
                                        <div className="glass-card" style={{ padding: 16 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                                                <Sparkles size={15} color="var(--accent)" />
                                                <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>✨ AI Post Composer</span>
                                            </div>

                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                                                <div>
                                                    <label style={{ fontSize: '0.67rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4, letterSpacing: '0.06em' }}>POST TYPE</label>
                                                    <select className="select" value={postType} onChange={e => setPostType(e.target.value)} style={{ fontSize: '0.8rem' }}>
                                                        {POST_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ').toUpperCase()}</option>)}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label style={{ fontSize: '0.67rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4, letterSpacing: '0.06em' }}>TONE</label>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                                        {TONES.map(t => (
                                                            <button key={t} className="btn btn-sm" onClick={() => setTone(t)} style={{ background: tone === t ? 'var(--accent-glow)' : 'var(--surface)', color: tone === t ? 'var(--accent)' : 'var(--text-secondary)', border: `1px solid ${tone === t ? 'var(--accent)' : 'var(--border)'}`, fontSize: '0.67rem', padding: '2px 7px' }}>
                                                                {t}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>

                                            <div>
                                                <label style={{ fontSize: '0.67rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4, letterSpacing: '0.06em' }}>HASHTAGS</label>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                                                    {['#Hiring', '#GOrecruitAI', '#HRTech', '#Jobs', '#AIRecruitment'].map(h => (
                                                        <button key={h} className="btn btn-sm btn-ghost" onClick={() => setHashtags(p => p.includes(h) ? p.replace(h, '').trim() : `${p} ${h}`.trim())} style={{ fontSize: '0.65rem', padding: '2px 7px', background: hashtags.includes(h) ? 'var(--accent-glow)' : undefined, color: hashtags.includes(h) ? 'var(--accent)' : undefined }}>
                                                            {h}
                                                        </button>
                                                    ))}
                                                </div>
                                                <input className="input" placeholder="Add custom hashtags..." value={hashtags} onChange={e => setHashtags(e.target.value)} style={{ fontSize: '0.8rem' }} />
                                            </div>
                                        </div>

                                        {/* AI Mode card: DeepSeek Generate / Write Manually */}
                                        <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
                                            <div style={{ display: 'flex' }}>
                                                <button
                                                    className={`btn btn-sm ${writeMode === 'ai' ? 'btn-primary' : 'btn-ghost'}`}
                                                    onClick={() => setWriteMode('ai')}
                                                    style={{ flex: 1, borderRadius: 0, borderRight: '1px solid var(--border)', padding: '10px 14px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                                                >
                                                    <Sparkles size={13} /> ✨ Generate with DeepSeek
                                                </button>
                                                <button
                                                    className={`btn btn-sm ${writeMode === 'manual' ? 'btn-primary' : 'btn-ghost'}`}
                                                    onClick={() => setWriteMode('manual')}
                                                    style={{ flex: 1, borderRadius: 0, padding: '10px 14px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                                                >
                                                    <Edit3 size={13} /> âœï¸ Write Manually
                                                </button>
                                            </div>

                                            <div style={{ padding: 14 }}>
                                                {writeMode === 'ai' ? (
                                                    <>
                                                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
                                                            {EMOJIS.map(e => <button key={e} className="btn btn-sm btn-ghost" onClick={() => setPrompt(p => p + e)} style={{ padding: '3px 6px', fontSize: '0.88rem' }}>{e}</button>)}
                                                        </div>
                                                        <div style={{ marginBottom: 10 }}>
                                                            <label style={{ fontSize: '0.67rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4, letterSpacing: '0.06em' }}>PROMPT / TOPIC</label>
                                                            <textarea className="textarea" placeholder="Describe what you want to post about..." value={prompt} onChange={e => setPrompt(e.target.value)} style={{ minHeight: 88, fontSize: '0.83rem' }} />
                                                        </div>
                                                        <div style={{ display: 'flex', gap: 8 }}>
                                                            <button className="btn btn-primary" onClick={handleGenerateAI} disabled={generatingAI || !prompt} style={{ flex: 1, fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                                                <Sparkles size={13} /> {generatingAI ? 'Generating...' : '✨ Generate with DeepSeek'}
                                                            </button>
                                                            <button className="btn btn-secondary" onClick={handleEnhanceAI} disabled={enhancingAI || !previewContent} style={{ flex: 1, color: 'var(--accent)', borderColor: 'var(--accent)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                                                <Sparkles size={13} /> {enhancingAI ? 'Enhancing...' : '💡 Enhance with DeepSeek'}
                                                            </button>
                                                        </div>
                                                    </>
                                                ) : (
                                                    <>
                                                        <div style={{ marginBottom: 10 }}>
                                                            <label style={{ fontSize: '0.67rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4, letterSpacing: '0.06em' }}>POST CONTENT</label>
                                                            <textarea
                                                                className="textarea"
                                                                placeholder="Write your post here... The preview on the right updates as you type."
                                                                value={manualContent}
                                                                onChange={e => { setManualContent(e.target.value); setPreviewContent(e.target.value); }}
                                                                style={{ minHeight: 150, fontSize: '0.85rem' }}
                                                            />
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.67rem', color: 'var(--text-muted)', marginTop: 3 }}>
                                                                <span>{manualContent.length} characters</span>
                                                                <span>{manualContent.length > 3000 ? '⚠ï¸ Too long' : manualContent.length > 2000 ? '⚡ Long post' : '✅ Good length'}</span>
                                                            </div>
                                                        </div>
                                                        <button className="btn btn-secondary w-full" onClick={handleEnhanceAI} disabled={enhancingAI || !manualContent} style={{ color: 'var(--accent)', borderColor: 'var(--accent)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                                            <Sparkles size={13} /> {enhancingAI ? 'Enhancing...' : '✨ Edit & Enhance with DeepSeek'}
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </div>

                                        {/* Schedule + Media: side by side in compact grid */}
                                        <div className="glass-card" style={{ padding: 14 }}>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                                <div>
                                                    <label style={{ fontSize: '0.67rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4, letterSpacing: '0.06em' }}>SCHEDULE POST</label>
                                                    <input className="input" type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} style={{ fontSize: '0.8rem' }} />
                                                </div>
                                                <div>
                                                    <label style={{ fontSize: '0.67rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4, letterSpacing: '0.06em' }}>MEDIA (OPTIONAL)</label>
                                                    {imageUrl ? (
                                                        <div style={{ position: 'relative', display: 'inline-block', width: '100%' }}>
                                                            <img src={imageUrl} alt="media" style={{ maxWidth: '100%', maxHeight: 64, borderRadius: 6, border: '1px solid var(--border)', display: 'block', objectFit: 'contain' }} />
                                                            <button className="btn btn-sm btn-ghost" onClick={() => setImageUrl('')} style={{ position: 'absolute', top: 2, right: 2, background: 'rgba(0,0,0,0.6)', color: '#fff', padding: 3 }}>
                                                                <X size={11} />
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                                            <label className="btn btn-secondary btn-sm" style={{ cursor: uploadingImage ? 'default' : 'pointer', margin: 0, fontSize: '0.72rem', whiteSpace: 'nowrap' }}>
                                                                {uploadingImage ? '...' : '📎 Upload'}
                                                                <input type="file" accept="image/*,video/*" style={{ display: 'none' }} disabled={uploadingImage}
                                                                    onChange={e => { handleImageUpload(e.target.files?.[0] || null); e.currentTarget.value = ''; }} />
                                                            </label>
                                                            <input className="input" placeholder="or paste URL" style={{ flex: 1, fontSize: '0.72rem' }}
                                                                onBlur={e => { const v = e.target.value.trim(); if (v) setImageUrl(v); }} />
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Publish Options + Submit */}
                                        <div className="glass-card" style={{ padding: 14 }}>
                                            {isAdmin && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                                                    <input type="checkbox" id="publishDirectly" checked={publishDirectly} onChange={e => setPublishDirectly(e.target.checked)} style={{ width: 15, height: 15, cursor: 'pointer' }} />
                                                    <label htmlFor="publishDirectly" style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer' }}>🚀 Publish directly to LinkedIn</label>
                                                </div>
                                            )}
                                            <button
                                                className="btn btn-primary w-full"
                                                onClick={handlePublishPost}
                                                disabled={savingPost || !previewContent}
                                                style={{ padding: '11px 16px', fontSize: '0.88rem', fontWeight: 700 }}
                                            >
                                                {savingPost ? 'Processing...' : publishDirectly ? '🚀 Publish directly to LinkedIn' : isAdmin ? '📤 Save & Approve' : '📤 Submit for Review'}
                                            </button>
                                        </div>
                                    </div>

                                    {/* RIGHT COLUMN: LinkedIn Live Preview — sticky */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, position: 'sticky', top: 16 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em' }}>LINKEDIN PREVIEW</div>
                                            <div style={{ fontSize: '0.63rem', color: 'var(--success)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)', display: 'inline-block' }} />
                                                Live
                                            </div>
                                        </div>

                                        <LinkedInPreview
                                            content={previewContent}
                                            hashtags={hashtags}
                                            imageUrl={imageUrl}
                                            authorName={user?.full_name || 'GOrecruitAI'}
                                            authorAvatar={user?.avatar_url}
                                        />

                                        {hashtags && (
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
                                                {hashtags.split(/\s+/).filter(Boolean).map((h, i) => (
                                                    <span key={i} style={{ color: '#0a66c2', fontSize: '0.73rem', fontWeight: 600, background: 'rgba(10,102,194,0.1)', padding: '2px 9px', borderRadius: 20 }}>
                                                        {h.startsWith('#') ? h : `#${h}`}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    </div>

                                    {/* Bottom: Agents who posted / are working on this */}
                                    {(() => {
                                        const currentTask = selectedTaskId ? tasks.find(t => t.id === selectedTaskId) : null;
                                        const assignedIds = currentTask?.assignments?.map((a: {agent_id: string}) => a.agent_id) || [];
                                        const assignedAgents = assignedIds.length > 0 ? agents.filter(a => assignedIds.includes(a.id)) : [];
                                        // Fallback: agents who created recent published posts
                                        const creatorIds = new Set(publishedPosts.slice(0, 20).map(p => p.created_by_id).filter(Boolean));
                                        const displayAgents = assignedAgents.length > 0 ? assignedAgents : agents.filter(a => creatorIds.has(a.id));
                                        if (displayAgents.length === 0) return null;
                                        return (
                                            <div className="glass-card" style={{ padding: '14px 18px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                                                    <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>👥 Agents on this post</span>
                                                    <span style={{ fontSize: '0.67rem', color: 'var(--text-muted)', background: 'var(--bg-tertiary)', padding: '2px 8px', borderRadius: 20, border: '1px solid var(--border)' }}>{displayAgents.length} agent{displayAgents.length !== 1 ? 's' : ''}</span>
                                                </div>
                                                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                                    {displayAgents.map((a: User) => (
                                                        <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--bg-tertiary)', borderRadius: 10, border: '1px solid var(--border)', flex: '1 1 210px', minWidth: 0 }}>
                                                            <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent-glow), var(--accent))', border: '2px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', fontWeight: 800, color: '#fff', overflow: 'hidden', flexShrink: 0 }}>
                                                                {a.avatar_url ? <img src={a.avatar_url} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} /> : a.full_name[0].toUpperCase()}
                                                            </div>
                                                            <div style={{ minWidth: 0, flex: 1 }}>
                                                                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.full_name}</div>
                                                                <div style={{ fontSize: '0.67rem', color: 'var(--text-muted)', marginTop: 1 }}>
                                                                    {a.region === 'India' ? '🇮🇳' : a.region === 'USA' ? '🇺🇸' : a.region === 'Indonesia' ? '🇮🇩' : 'ðŸŒ'} {a.region}
                                                                </div>
                                                            </div>
                                                            <div style={{ display: 'flex', gap: 4 }}>
                                                                <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--success-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Liked">
                                                                    <ThumbsUp size={12} color="var(--success)" />
                                                                </div>
                                                                <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--warning-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Commented">
                                                                    <MessageSquare size={12} color="var(--warning)" />
                                                                </div>
                                                                <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--info-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Shared">
                                                                    <Share2 size={12} color="var(--info)" />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>
                            )}
                        </div>
                    ) : (
                        /* Published Posts History view */
                        <div style={{ animation: 'fadeIn 0.25s ease-in-out' }}>
                            {selectedHistoryPost ? (() => {
                                const trackedLikes = selectedHistoryPost.employee_engagement ? Object.values(selectedHistoryPost.employee_engagement).filter((v: any) => v.like).length : 0;
                                const trackedComments = selectedHistoryPost.employee_engagement ? Object.values(selectedHistoryPost.employee_engagement).filter((v: any) => v.comment).length : 0;
                                const trackedShares = selectedHistoryPost.employee_engagement ? Object.values(selectedHistoryPost.employee_engagement).filter((v: any) => v.share).length : 0;
                                const mediaBadge = selectedHistoryPost.image_url
                                    ? (/\.(mp4|mov|webm)$/i.test(selectedHistoryPost.image_url) ? 'Video Post' : 'Image Post')
                                    : 'Text Post';
                                const daysAgo = Math.max(0, Math.floor((new Date().getTime() - new Date(selectedHistoryPost.published_at || selectedHistoryPost.created_at).getTime()) / (1000 * 60 * 60 * 24)));
                                const filteredAgents = agents.filter((u: User) => u.role === 'agent' && u.full_name.toLowerCase().includes(employeeSearch.toLowerCase()));

                                return (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <button
                                                className="btn btn-ghost btn-sm"
                                                onClick={() => setSelectedHistoryPost(null)}
                                                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600 }}
                                            >
                                                ← Back to posts
                                            </button>
                                            <button
                                                className="btn btn-ghost btn-sm"
                                                onClick={() => handleDeleteHistoryPost(selectedHistoryPost.id)}
                                                style={{ color: 'var(--danger)', display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600 }}
                                            >
                                                🗑️ Delete Post
                                            </button>
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, alignItems: 'start' }}>
                                            {/* Left Column */}
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                                {/* Content Card */}
                                                <div className="glass-card" style={{ padding: 18 }}>
                                                    <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                                                        <span className="badge badge-primary" style={{ background: 'var(--accent-glow)', color: 'var(--accent)', border: '1px solid var(--accent)' }}>{mediaBadge}</span>
                                                        <span className="badge badge-accent" style={{ textTransform: 'capitalize' }}>{selectedHistoryPost.post_type.replace('_', ' ')}</span>
                                                        <span className="badge badge-muted">by api</span>
                                                    </div>

                                                    <h3 style={{ margin: '8px 0 12px', fontSize: '1.05rem', fontWeight: 700, lineHeight: 1.4, color: 'var(--text-primary)' }}>
                                                        {selectedHistoryPost.title || selectedHistoryPost.content.split('\n')[0]}
                                                    </h3>

                                                    <h4 style={{ margin: '14px 0 6px 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>We are looking</h4>

                                                    <div style={{
                                                        fontSize: '0.85rem',
                                                        color: 'var(--text-secondary)',
                                                        background: 'var(--bg-tertiary)',
                                                        padding: 14,
                                                        borderRadius: 8,
                                                        whiteSpace: 'pre-wrap',
                                                        lineHeight: 1.6,
                                                        maxHeight: 250,
                                                        overflowY: 'auto',
                                                        border: '1px solid var(--border)'
                                                    }}>
                                                        {selectedHistoryPost.content}
                                                    </div>

                                                    <div style={{ marginTop: 12, fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
                                                        <span>Posted {selectedHistoryPost.published_at ? new Date(selectedHistoryPost.published_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : new Date(selectedHistoryPost.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                                                        <span>Last synced: {daysAgo} days ago</span>
                                                    </div>
                                                </div>

                                                {/* Link Card */}
                                                <div className="glass-card" style={{ padding: 18 }}>
                                                    <h4 style={{ margin: 0, marginBottom: 6, fontSize: '0.88rem' }}>🔗 LinkedIn post link</h4>
                                                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                                                        <input
                                                            className="input"
                                                            placeholder="https://www.linkedin.com/feed/update/urn:li:share:..."
                                                            value={editingLinkUrl}
                                                            onChange={e => setEditingLinkUrl(e.target.value)}
                                                            style={{ flex: 1 }}
                                                        />
                                                        <button
                                                            className="btn btn-primary"
                                                            onClick={() => handleSaveLinkedInLink(editingLinkUrl)}
                                                            style={{ padding: '0 16px', height: 38 }}
                                                        >
                                                            Save
                                                        </button>
                                                    </div>
                                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 6 }}>
                                                        Paste the LinkedIn post URL here to enable sync and preview.
                                                    </div>
                                                </div>

                                                {/* Metrics Card */}
                                                <div className="glass-card" style={{ padding: 18 }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                                        <h4 style={{ margin: 0, fontSize: '0.88rem' }}>📊 Engagement metrics</h4>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                                                Add LinkedIn URL above to enable sync.
                                                            </span>
                                                            <button
                                                                className="btn btn-secondary btn-sm"
                                                                onClick={handleDemoSync}
                                                                style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                                                            >
                                                                Demo sync
                                                            </button>
                                                        </div>
                                                    </div>

                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                                                        <div style={{ background: 'var(--bg-tertiary)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
                                                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600 }}>LinkedIn likes</div>
                                                            <div style={{ fontSize: '1.4rem', fontWeight: 800, marginTop: 4, color: '#0a66c2' }}>{historyPostMetrics.likes || 9}</div>
                                                        </div>
                                                        <div style={{ background: 'var(--bg-tertiary)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
                                                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600 }}>LinkedIn comments</div>
                                                            <div style={{ fontSize: '1.4rem', fontWeight: 800, marginTop: 4, color: '#00a86b' }}>{historyPostMetrics.comments || 2}</div>
                                                        </div>
                                                        <div style={{ background: 'var(--bg-tertiary)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
                                                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600 }}>LinkedIn shares</div>
                                                            <div style={{ fontSize: '1.4rem', fontWeight: 800, marginTop: 4, color: '#ff9900' }}>{historyPostMetrics.shares || 0}</div>
                                                        </div>
                                                        <div style={{ background: 'var(--bg-tertiary)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
                                                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600 }}>Tracked likes</div>
                                                            <div style={{ fontSize: '1.4rem', fontWeight: 800, marginTop: 4, color: 'var(--text-primary)' }}>{trackedLikes}</div>
                                                        </div>
                                                        <div style={{ background: 'var(--bg-tertiary)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
                                                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600 }}>Tracked comments</div>
                                                            <div style={{ fontSize: '1.4rem', fontWeight: 800, marginTop: 4, color: 'var(--text-primary)' }}>{trackedComments}</div>
                                                        </div>
                                                        <div style={{ background: 'var(--bg-tertiary)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
                                                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600 }}>Tracked shares</div>
                                                            <div style={{ fontSize: '1.4rem', fontWeight: 800, marginTop: 4, color: 'var(--text-primary)' }}>{trackedShares}</div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Right Column (Preview Sidebar) */}
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                                <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>LINKEDIN PREVIEW</div>
                                                <LinkedInPreview
                                                    content={selectedHistoryPost.content}
                                                    hashtags={selectedHistoryPost.hashtags}
                                                    imageUrl={selectedHistoryPost.image_url}
                                                    authorName={selectedHistoryPost.created_by_name || 'GOrecruitAI'}
                                                    authorAvatar={selectedHistoryPost.created_by_avatar}
                                                    initialLikes={selectedHistoryPost.employee_engagement ? Object.values(selectedHistoryPost.employee_engagement).filter((v: any) => v.like).length : 0}
                                                    initialComments={selectedHistoryPost.employee_engagement ? Object.values(selectedHistoryPost.employee_engagement).filter((v: any) => v.comment).length : 0}
                                                    initialShares={selectedHistoryPost.employee_engagement ? Object.values(selectedHistoryPost.employee_engagement).filter((v: any) => v.share).length : 0}
                                                    postStatus={selectedHistoryPost.status}
                                                />

                                                {selectedHistoryPost.hashtags && (
                                                    <div className="glass-card" style={{ padding: 14 }}>
                                                        <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>Hash tags used</div>
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

                                        {/* Full Width Bottom: Employee Engagement */}
                                        <div className="glass-card" style={{ marginTop: 20, padding: 18 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                                <div>
                                                    <h4 style={{ margin: 0, fontSize: '0.92rem' }}>Employee engagement</h4>
                                                    <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>Tick the actions each employee took on this post:</p>
                                                </div>
                                                <div style={{ position: 'relative', width: 220 }}>
                                                    <input
                                                        className="input"
                                                        placeholder="Search employees..."
                                                        value={employeeSearch}
                                                        onChange={e => setEmployeeSearch(e.target.value)}
                                                        style={{ fontSize: '0.8rem', paddingLeft: 30, height: 'auto', paddingTop: 6, paddingBottom: 6 }}
                                                    />
                                                    <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                                </div>
                                            </div>

                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                                {filteredAgents.map((a: User) => {
                                                    const empEng = selectedHistoryPost.employee_engagement?.[a.id] || { like: false, comment: false, share: false };
                                                    return (
                                                        <div key={a.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: 6, border: '1px solid var(--border)' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--accent-glow)', border: '1px solid var(--accent)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 'bold' }}>
                                                                    {a.avatar_url ? <img src={a.avatar_url} alt="avatar" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : a.full_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                                                                </div>
                                                                <div>
                                                                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>{a.full_name}</div>
                                                                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                                                                        {a.region === 'India' ? '🇮🇳 IN | India' : a.region === 'USA' ? '🇺🇸 US | USA' : a.region === 'Indonesia' ? '🇮🇩 ID | Indonesia' : `🌐 ${a.region}`}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div style={{ display: 'flex', gap: 10 }}>
                                                                <button
                                                                    className="btn btn-ghost"
                                                                    onClick={() => handleToggleEmployeeEngagement(selectedHistoryPost.id, a.id, 'like', empEng.like)}
                                                                    style={{
                                                                        width: 32,
                                                                        height: 32,
                                                                        borderRadius: '50%',
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        justifyContent: 'center',
                                                                        background: empEng.like ? 'var(--success-glow)' : 'transparent',
                                                                        color: empEng.like ? 'var(--success)' : 'var(--text-muted)',
                                                                        border: empEng.like ? '1px solid var(--success)' : '1px solid var(--border)',
                                                                        padding: 0,
                                                                    }}
                                                                    title="Liked"
                                                                >
                                                                    <ThumbsUp size={14} fill={empEng.like ? 'currentColor' : 'none'} />
                                                                </button>
                                                                <button
                                                                    className="btn btn-ghost"
                                                                    onClick={() => handleToggleEmployeeEngagement(selectedHistoryPost.id, a.id, 'comment', empEng.comment)}
                                                                    style={{
                                                                        width: 32,
                                                                        height: 32,
                                                                        borderRadius: '50%',
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        justifyContent: 'center',
                                                                        background: empEng.comment ? 'var(--warning-glow)' : 'transparent',
                                                                        color: empEng.comment ? 'var(--warning)' : 'var(--text-muted)',
                                                                        border: empEng.comment ? '1px solid var(--warning)' : '1px solid var(--border)',
                                                                        padding: 0,
                                                                    }}
                                                                    title="Commented"
                                                                >
                                                                    <MessageSquare size={14} fill={empEng.comment ? 'currentColor' : 'none'} />
                                                                </button>
                                                                <button
                                                                    className="btn btn-ghost"
                                                                    onClick={() => handleToggleEmployeeEngagement(selectedHistoryPost.id, a.id, 'share', empEng.share)}
                                                                    style={{
                                                                        width: 32,
                                                                        height: 32,
                                                                        borderRadius: '50%',
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        justifyContent: 'center',
                                                                        background: empEng.share ? 'var(--info-glow)' : 'transparent',
                                                                        color: empEng.share ? 'var(--info)' : 'var(--text-muted)',
                                                                        border: empEng.share ? '1px solid var(--info)' : '1px solid var(--border)',
                                                                        padding: 0,
                                                                    }}
                                                                    title="Shared"
                                                                >
                                                                    <Share2 size={14} />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                                {filteredAgents.length === 0 && (
                                                    <div style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)', padding: 16 }}>No employees match the search filter.</div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()
                            : (
                                /* List view */
                                <div>
                                    {/* KPI Summary Cards */}
                                    {(() => {
                                        let totalLikes = 0;
                                        let totalComments = 0;
                                        let totalShares = 0;
                                        filteredHistoryPosts.forEach(p => {
                                            const eng = p.employee_engagement || {};
                                            Object.values(eng).forEach((e: any) => {
                                                if (e.like) totalLikes++;
                                                if (e.comment) totalComments++;
                                                if (e.share) totalShares++;
                                            });
                                        });
                                        const totalEngagement = totalLikes + totalComments + totalShares;
                                        const avgEngagement = filteredHistoryPosts.length > 0 ? (totalEngagement / filteredHistoryPosts.length).toFixed(1) : '0';

                                        return (
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
                                                    <div style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: 4, color: 'var(--success)' }}>{totalEngagement}</div>
                                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>Tracked clicks</div>
                                                </div>
                                                <div className="glass-card" style={{ padding: 16 }}>
                                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>AVG PER POST</div>
                                                    <div style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: 4, color: 'var(--accent)' }}>{avgEngagement}</div>
                                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>Average engagement rate</div>
                                                </div>
                                            </div>
                                        );
                                    })()}

                                    {/* Filters bar */}
                                    <div className="glass-card" style={{ padding: 16, marginBottom: 20 }}>
                                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', flex: 1 }}>
                                                <div style={{ minWidth: 200, flex: 1 }}>
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
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>From:</span>
                                                    <input className="input" type="date" value={historyFromDate} onChange={e => setHistoryFromDate(e.target.value)} style={{ width: 'auto' }} />
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>To:</span>
                                                    <input className="input" type="date" value={historyToDate} onChange={e => setHistoryToDate(e.target.value)} style={{ width: 'auto' }} />
                                                </div>
                                            </div>

                                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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
                                                        Clear
                                                    </button>
                                                )}
                                                <button
                                                    className="btn btn-primary"
                                                    onClick={() => { setComposerSubTab('create'); setSelectedTaskId(null); setPreviewContent(''); setHashtags(''); setImageUrl(''); }}
                                                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}
                                                >
                                                    <Plus size={14} /> New post
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Posts Cards Container */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 600, overflowY: 'auto', paddingRight: 4 }}>
                                        {filteredHistoryPosts.length === 0 && (
                                            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', border: '2px dashed var(--border)', borderRadius: 8 }}>
                                                No published posts found 📭
                                            </div>
                                        )}
                                        {filteredHistoryPosts.map(p => {
                                            const eng = p.employee_engagement || {};
                                            let postLikes = 0, postComments = 0, postShares = 0;
                                            Object.values(eng).forEach((e: any) => {
                                                if (e.like) postLikes++;
                                                if (e.comment) postComments++;
                                                if (e.share) postShares++;
                                            });

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
                                                    {/* Left: Thumbnail & Details */}
                                                    <div style={{ display: 'flex', gap: 14, flex: 1, minWidth: 0, alignItems: 'center' }}>
                                                        {p.image_url ? (
                                                            <div style={{ width: 64, height: 64, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                                {/\.(mp4|mov|webm)$/i.test(p.image_url) ? (
                                                                    <div style={{ fontSize: '1.2rem' }}>🎥</div>
                                                                ) : (
                                                                    <img src={p.image_url} alt="thumbnail" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <div style={{ width: 64, height: 64, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '1.2rem', fontWeight: 'bold', flexShrink: 0 }}>
                                                                📝
                                                            </div>
                                                        )}

                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                                                <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--accent-glow)', border: '1px solid var(--accent)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.62rem', fontWeight: 'bold', overflow: 'hidden' }}>
                                                                    {p.created_by_avatar ? <img src={p.created_by_avatar} alt="avatar" style={{ width: '100%', height: '100%' }} /> : (p.created_by_name ? p.created_by_name[0] : 'A')}
                                                                </div>
                                                                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                                                                    {p.created_by_name || 'Agent'}
                                                                </span>
                                                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                                                    • {p.published_at ? new Date(p.published_at).toLocaleDateString() : new Date(p.created_at).toLocaleDateString()}
                                                                </span>
                                                                <span className="badge badge-accent" style={{ fontSize: '0.58rem', textTransform: 'uppercase', padding: '2px 6px' }}>
                                                                    {p.region}
                                                                </span>
                                                            </div>

                                                            <div
                                                                style={{
                                                                    fontSize: '0.85rem',
                                                                    color: 'var(--text-primary)',
                                                                    lineHeight: 1.4,
                                                                    overflow: 'hidden',
                                                                    textOverflow: 'ellipsis',
                                                                    display: '-webkit-box',
                                                                    WebkitLineClamp: 2,
                                                                    WebkitBoxOrient: 'vertical'
                                                                }}
                                                                title={p.content}
                                                            >
                                                                {p.content}
                                                            </div>

                                                            <div style={{ display: 'flex', gap: 12, marginTop: 8, alignItems: 'center' }}>
                                                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                                    👍 {postLikes}
                                                                </span>
                                                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                                    💬 {postComments}
                                                                </span>
                                                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                                    🔁 {postShares}
                                                                </span>
                                                                {p.linkedin_post_id && (
                                                                    <a
                                                                        href={p.linkedin_post_id}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        style={{ fontSize: '0.72rem', color: 'var(--accent)', textDecoration: 'none', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 2, marginLeft: 8 }}
                                                                    >
                                                                        Live Link ↗
                                                                    </a>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Right: Actions */}
                                                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                                                        <button
                                                            className="btn btn-secondary btn-sm"
                                                            onClick={() => handleViewPostDetails(p)}
                                                            style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                                                        >
                                                            View post
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
                </div >
            )}

            {/* ── Kanban Tab ────────────────────────────────────────────────── */}
            {
                tab === 'kanban' && (
                    <div>
                        <div style={{ marginBottom: 16 }}>
                            <h4>Approval Pipeline</h4>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Drag posts through the review process</p>
                        </div>
                        <KanbanBoardView board={board} onRefresh={loadAll} />
                    </div>
                )
            }

            {/* ── Library Tab ───────────────────────────────────────────────── */}
            {
                tab === 'library' && (
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
                )
            }


        </div >
    );
};
