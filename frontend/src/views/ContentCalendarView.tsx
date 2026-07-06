import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
    format, startOfMonth, endOfMonth, eachDayOfInterval,
    isSameMonth, isToday, startOfWeek, endOfWeek,
    addMonths, subMonths, parseISO, isSameDay, addWeeks, subWeeks,
    startOfWeek as startOfWk, endOfWeek as endOfWk,
} from 'date-fns';
import {
    Plus, ChevronLeft, ChevronRight, Calendar,
    Clock, Edit3, X, Send, Flag, CheckSquare, Trash2, Star
} from 'lucide-react';
import { postsApi, tasksApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';

// Safe date parsing to prevent RangeError from invalid, SQL Server formatted, or empty strings
const safeParseDate = (dateVal: any): Date => {
    if (!dateVal) return new Date();
    if (dateVal instanceof Date) {
        return isNaN(dateVal.getTime()) ? new Date() : dateVal;
    }
    if (typeof dateVal === 'string') {
        let cleanStr = dateVal.trim();
        // Replace space in SQL Server formatted datetimes (YYYY-MM-DD HH:MM:SS) to match ISO 8601
        if (cleanStr.includes(' ') && !cleanStr.includes('T')) {
            cleanStr = cleanStr.replace(' ', 'T');
        }
        try {
            const parsed = parseISO(cleanStr);
            if (!isNaN(parsed.getTime())) return parsed;
        } catch { }
        try {
            const parsed = new Date(cleanStr);
            if (!isNaN(parsed.getTime())) return parsed;
        } catch { }
    }
    return new Date();
};

const safeFormat = (dateVal: any, formatString: string): string => {
    try {
        const dateObj = safeParseDate(dateVal);
        return format(dateObj, formatString);
    } catch {
        return '—';
    }
};

interface Props { region: string; }

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
    draft: { label: 'Draft', color: '#94a3b8', bg: '#f1f5f9' },
    pending_review: { label: 'Pending Review', color: '#b45309', bg: '#fef3c7' },
    pending_approval: { label: 'In Review', color: '#b45309', bg: '#fef3c7' },
    approved: { label: 'Approved', color: '#0891b2', bg: '#e0f2fe' },
    scheduled: { label: 'Scheduled', color: '#7c3aed', bg: '#f5f3ff' },
    published: { label: 'Published', color: '#10b981', bg: '#d1fae5' },
    rejected: { label: 'Rejected', color: '#ef4444', bg: '#fee2e2' },
};

const TASK_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
    pending: { label: 'Pending', color: '#94a3b8', bg: '#f1f5f9' },
    active: { label: 'Active', color: '#2563eb', bg: '#eff6ff' },
    in_progress: { label: 'In Progress', color: '#2563eb', bg: '#eff6ff' },
    pending_approval: { label: 'In Review', color: '#b45309', bg: '#fef3c7' },
    completed: { label: 'Done', color: '#10b981', bg: '#d1fae5' },
    overdue: { label: 'Overdue', color: '#ef4444', bg: '#fee2e2' },
    on_hold: { label: 'On Hold', color: '#f59e0b', bg: '#fef3c7' },
};

type ViewMode = 'month' | 'week' | 'list';

const REGIONS = ['Global', 'India', 'USA', 'Indonesia'];
const POST_TYPES = ['All', 'article', 'post', 'video', 'poll', 'document'];



const buildHolidayMap = (year: number): Record<string, Array<{ name: string; region: string; color: string }>> => {
    const map: Record<string, Array<{ name: string; region: string; color: string }>> = {};

    const add = (dateStr: string, name: string, region: string, color: string) => {
        if (!map[dateStr]) map[dateStr] = [];
        map[dateStr].push({ name, region, color });
    };

    if (year === 2026) {
        // India (🇮🇳)
        add(`2026-01-26`, '🇮🇳 Republic Day', 'India', '#FF9933');
        add(`2026-03-03`, '🇮🇳 Holi', 'India', '#FF9933');
        add(`2026-04-03`, '🇮🇳 Good Friday', 'India', '#FF9933');
        add(`2026-04-14`, '🇮🇳 Dr. Ambedkar Jayanti', 'India', '#FF9933');
        add(`2026-05-01`, '🇮🇳 Buddha Purnima', 'India', '#FF9933');
        add(`2026-05-27`, '🇮🇳 Eid ul-Adha', 'India', '#FF9933');
        add(`2026-08-15`, '🇮🇳 Independence Day', 'India', '#FF9933');
        add(`2026-10-02`, '🇮🇳 Gandhi Jayanti', 'India', '#FF9933');
        add(`2026-10-20`, '🇮🇳 Dussehra', 'India', '#FF9933');
        add(`2026-11-08`, '🇮🇳 Diwali', 'India', '#FF9933');
        add(`2026-11-10`, '🇮🇳 Bhai Dooj', 'India', '#FF9933');
        add(`2026-12-25`, '🇮🇳 Christmas Day', 'India', '#FF9933');

        // USA (🇺🇸)
        add(`2026-01-01`, "🇺🇸 New Year's Day", 'USA', '#3B82F6');
        add(`2026-01-19`, '🇺🇸 MLK Day', 'USA', '#3B82F6');
        add(`2026-02-16`, "🇺🇸 Presidents' Day", 'USA', '#3B82F6');
        add(`2026-05-25`, '🇺🇸 Memorial Day', 'USA', '#3B82F6');
        add(`2026-06-19`, '🇺🇸 Juneteenth', 'USA', '#3B82F6');
        add(`2026-07-04`, '🇺🇸 Independence Day', 'USA', '#3B82F6');
        add(`2026-09-07`, '🇺🇸 Labor Day', 'USA', '#3B82F6');
        add(`2026-10-12`, '🇺🇸 Columbus Day', 'USA', '#3B82F6');
        add(`2026-11-11`, '🇺🇸 Veterans Day', 'USA', '#3B82F6');
        add(`2026-11-26`, '🇺🇸 Thanksgiving Day', 'USA', '#3B82F6');
        add(`2026-12-25`, '🇺🇸 Christmas Day', 'USA', '#3B82F6');

        // Indonesia (🇮🇩)
        add(`2026-01-01`, "🇮🇩 New Year's Day", 'Indonesia', '#DC2626');
        add(`2026-01-16`, "🇮🇩 Isra Mi'raj", 'Indonesia', '#DC2626');
        add(`2026-02-17`, '🇮🇩 Lunar New Year', 'Indonesia', '#DC2626');
        add(`2026-04-03`, '🇮🇩 Good Friday', 'Indonesia', '#DC2626');
        add(`2026-04-05`, '🇮🇩 Easter Sunday', 'Indonesia', '#DC2626');
        add(`2026-05-01`, '🇮🇩 Labour Day', 'Indonesia', '#DC2626');
        add(`2026-05-14`, '🇮🇩 Ascension of Jesus Christ', 'Indonesia', '#DC2626');
        add(`2026-06-01`, '🇮🇩 Pancasila Day', 'Indonesia', '#DC2626');
        add(`2026-05-27`, '🇮🇩 Eid al-Adha', 'Indonesia', '#DC2626');
        add(`2026-08-17`, '🇮🇩 Independence Day', 'Indonesia', '#DC2626');
        add(`2026-09-15`, '🇮🇩 Maulid Nabi', 'Indonesia', '#DC2626');
        add(`2026-12-25`, '🇮🇩 Christmas Day', 'Indonesia', '#DC2626');

        // Global (important international days with flags)
        add(`2026-03-08`, "🌐 Int'l Women's Day", 'Global', '#7C3AED');
        add(`2026-04-22`, '🌐 Earth Day', 'Global', '#7C3AED');
        add(`2026-05-01`, "🌐 International Workers' Day", 'Global', '#7C3AED');
        add(`2026-07-15`, "🌐 World Youth Skills Day", 'Global', '#7C3AED');
        add(`2026-10-10`, "🌐 World Mental Health Day", 'Global', '#7C3AED');
    } else {
        // Fallback for other years using generic math
        // India (🇮🇳)
        add(`${year}-01-26`, '🇮🇳 Republic Day', 'India', '#FF9933');
        add(`${year}-03-25`, '🇮🇳 Holi', 'India', '#FF9933');
        add(`${year}-04-14`, '🇮🇳 Dr. Ambedkar Jayanti', 'India', '#FF9933');
        add(`${year}-04-18`, '🇮🇳 Good Friday', 'India', '#FF9933');
        add(`${year}-05-23`, '🇮🇳 Buddha Purnima', 'India', '#FF9933');
        add(`${year}-06-17`, '🇮🇳 Eid ul-Adha', 'India', '#FF9933');
        add(`${year}-08-15`, '🇮🇳 Independence Day', 'India', '#FF9933');
        add(`${year}-10-02`, '🇮🇳 Gandhi Jayanti', 'India', '#FF9933');
        add(`${year}-10-24`, '🇮🇳 Dussehra', 'India', '#FF9933');
        add(`${year}-11-01`, '🇮🇳 Diwali', 'India', '#FF9933');
        add(`${year}-11-05`, '🇮🇳 Bhai Dooj', 'India', '#FF9933');
        add(`${year}-12-25`, '🇮🇳 Christmas Day', 'India', '#FF9933');

        // USA (🇺🇸)
        add(`${year}-01-01`, "🇺🇸 New Year's Day", 'USA', '#3B82F6');
        add(`${year}-01-20`, '🇺🇸 MLK Day', 'USA', '#3B82F6');
        add(`${year}-02-17`, "🇺🇸 Presidents' Day", 'USA', '#3B82F6');
        add(`${year}-05-26`, '🇺🇸 Memorial Day', 'USA', '#3B82F6');
        add(`${year}-06-19`, '🇺🇸 Juneteenth', 'USA', '#3B82F6');
        add(`${year}-07-04`, '🇺🇸 Independence Day', 'USA', '#3B82F6');
        add(`${year}-09-01`, '🇺🇸 Labor Day', 'USA', '#3B82F6');
        add(`${year}-10-13`, '🇺🇸 Columbus Day', 'USA', '#3B82F6');
        add(`${year}-11-11`, '🇺🇸 Veterans Day', 'USA', '#3B82F6');
        add(`${year}-11-27`, '🇺🇸 Thanksgiving Day', 'USA', '#3B82F6');
        add(`${year}-12-25`, '🇺🇸 Christmas Day', 'USA', '#3B82F6');

        // Indonesia (🇮🇩)
        add(`${year}-01-01`, "🇮🇩 New Year's Day", 'Indonesia', '#DC2626');
        add(`${year}-01-29`, '🇮🇩 Lunar New Year', 'Indonesia', '#DC2626');
        add(`${year}-03-29`, "🇮🇩 Isra Mi'raj", 'Indonesia', '#DC2626');
        add(`${year}-04-18`, '🇮🇩 Good Friday', 'Indonesia', '#DC2626');
        add(`${year}-04-20`, '🇮🇩 Easter Sunday', 'Indonesia', '#DC2626');
        add(`${year}-05-01`, '🇮🇩 Labour Day', 'Indonesia', '#DC2626');
        add(`${year}-05-29`, '🇮🇩 Ascension Day', 'Indonesia', '#DC2626');
        add(`${year}-06-01`, '🇮🇩 Pancasila Day', 'Indonesia', '#DC2626');
        add(`${year}-06-17`, '🇮🇩 Eid al-Adha', 'Indonesia', '#DC2626');
        add(`${year}-08-17`, '🇮🇩 Independence Day', 'Indonesia', '#DC2626');
        add(`${year}-10-05`, '🇮🇩 Maulid Prophet', 'Indonesia', '#DC2626');
        add(`${year}-12-25`, '🇮🇩 Christmas Day', 'Indonesia', '#DC2626');

        // Global
        add(`${year}-03-08`, "🌐 Int'l Women's Day", 'Global', '#7C3AED');
        add(`${year}-04-22`, '🌐 Earth Day', 'Global', '#7C3AED');
        add(`${year}-05-15`, "🌐 Int'l Labour Day", 'Global', '#7C3AED');
        add(`${year}-10-10`, "🌐 World Mental Health Day", 'Global', '#7C3AED');
        add(`${year}-11-12`, "🌐 World Youth Skills Day", 'Global', '#7C3AED');
    }

    return map;
};

const REGION_FLAG: Record<string, string> = {
    India: '🇮🇳', USA: '🇺🇸', Indonesia: '🇮🇩', Global: '🌐',
};

export const ContentCalendarView: React.FC<Props> = ({ region }) => {
    const { user } = useAuthStore();
    const [searchParams] = useSearchParams();
    const postIdParam = searchParams.get('postId');
    const [posts, setPosts] = useState<any[]>([]);
    const [tasks, setTasks] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<ViewMode>('month');
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [selectedPost, setSelectedPost] = useState<any | null>(null);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showDayPanel, setShowDayPanel] = useState(false);
    const [filterRegion, setFilterRegion] = useState('Global');
    const [filterType, setFilterType] = useState('All');
    const [filterStatus, setFilterStatus] = useState('All');
    const [showHolidays, setShowHolidays] = useState(true);
    const [holidayRegionFilter, setHolidayRegionFilter] = useState('All');
    const [newPost, setNewPost] = useState({
        content: '', post_type: 'post', region: region,
        scheduled_at: '', status: 'draft',
    });
    const [newTask, setNewTask] = useState({ title: '', due_date: '', priority: 'medium' });
    const [showTaskForm, setShowTaskForm] = useState(false);
    const initialLoaded = useRef(false);
    const isAdmin = user?.role === 'admin';

    const holidayMap = buildHolidayMap(currentDate.getFullYear());

    const getHolidaysForDay = (day: Date) => {
        const key = safeFormat(day, 'yyyy-MM-dd');
        const all = holidayMap[key] || [];
        if (holidayRegionFilter === 'All') return all;
        return all.filter(h => h.region === holidayRegionFilter || h.region === 'Global');
    };

    const load = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const regionParam = filterRegion === 'Global' ? undefined : filterRegion;
            const [pRes, tRes] = await Promise.all([
                postsApi.list({ region: regionParam, limit: 500 }),
                tasksApi.list({ region: regionParam }),
            ]);
            setPosts(pRes.data);
            setTasks(tRes.data);
        } catch { }
        if (!silent) setLoading(false);
    }, [filterRegion]);

    useEffect(() => {
        if (!initialLoaded.current) {
            initialLoaded.current = true;
            load(false);
        } else {
            load(false);
        }
        const t = setInterval(() => load(true), 30000);
        return () => clearInterval(t);
    }, [filterRegion]);

    useEffect(() => {
        if (postIdParam && posts.length > 0) {
            const post = posts.find(p => p.id === postIdParam);
            if (post) {
                setSelectedPost(post);
            }
        }
    }, [postIdParam, posts]);

    // Filter posts
    const filteredPosts = posts.filter(p => {
        if (filterType !== 'All' && p.post_type !== filterType) return false;
        if (filterStatus !== 'All' && p.status !== filterStatus) return false;
        return true;
    });

    const getPostsForDay = (day: Date) => filteredPosts.filter(p => {
        const dateStr = p.scheduled_at || p.created_at;
        if (!dateStr) return false;
        try { return isSameDay(safeParseDate(dateStr), day); } catch { return false; }
    });

    const getTasksForDay = (day: Date) => tasks.filter(t => {
        if (!t.due_date) return false;
        try { return isSameDay(safeParseDate(t.due_date), day); } catch { return false; }
    });

    const handleCreatePost = async () => {
        if (!newPost.content.trim()) { toast.error('Content is required'); return; }
        try {
            await postsApi.create({
                ...newPost,
                scheduled_at: newPost.scheduled_at || null,
                region: filterRegion === 'Global' ? 'Global' : filterRegion,
            });
            toast.success('Post created!');
            setShowCreateModal(false);
            setNewPost({ content: '', post_type: 'post', region, scheduled_at: '', status: 'draft' });
            load(false);
        } catch { toast.error('Failed to create post'); }
    };

    const handleCreateTask = async () => {
        if (!newTask.title.trim()) { toast.error('Task title required'); return; }
        try {
            const dueDateFull = selectedDate
                ? `${safeFormat(selectedDate, 'yyyy-MM-dd')}T09:00:00`
                : (newTask.due_date || undefined);
            await tasksApi.create({
                title: newTask.title,
                due_date: dueDateFull,
                priority: newTask.priority,
                region: filterRegion === 'Global' ? 'Global' : filterRegion,
            });
            toast.success('Task added!');
            setNewTask({ title: '', due_date: '', priority: 'medium' });
            setShowTaskForm(false);
            load(false);
        } catch { toast.error('Failed to add task'); }
    };

    const handleDeleteTask = async (taskId: any) => {
        if (!window.confirm('Delete this task?')) return;
        try {
            await tasksApi.delete(taskId.toString());
            toast.success('Task removed');
            load(false);
        } catch { toast.error('Failed to delete task'); }
    };

    const handleDeletePost = async (postId: string) => {
        if (!window.confirm('Are you sure you want to delete this post?')) return;
        try {
            await postsApi.delete(postId);
            toast.success('Post deleted!');
            setSelectedPost(null);
            load(true);
        } catch { toast.error('Failed to delete post'); }
    };

    const handleDayClick = (day: Date) => {
        setSelectedDate(day);
        const sch = safeFormat(day, "yyyy-MM-dd'T'HH:mm");
        setNewPost(p => ({ ...p, scheduled_at: sch }));
        setShowDayPanel(true);
        setShowTaskForm(false);
    };

    // ── Month View ──────────────────────────────────────────────────────────
    const MonthView = () => {
        const monthStart = startOfMonth(currentDate);
        const monthEnd = endOfMonth(currentDate);
        const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
        const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
        const days = eachDayOfInterval({ start: calStart, end: calEnd });
        const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

        const totalScheduled = filteredPosts.filter(p => {
            try { return isSameMonth(safeParseDate(p.scheduled_at || p.created_at), currentDate); }
            catch { return false; }
        }).length;

        return (
            <div>
                {/* Month stats bar */}
                <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                    {Object.entries(STATUS_CONFIG).map(([s, cfg]) => {
                        const count = filteredPosts.filter(p => p.status === s).length;
                        if (!count) return null;
                        return (
                            <div key={s} style={{
                                display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px',
                                background: cfg.bg, borderRadius: 99, fontSize: '0.75rem', fontWeight: 600,
                                color: cfg.color, cursor: 'pointer', border: `1px solid ${cfg.color}30`,
                            }} onClick={() => setFilterStatus(s === filterStatus ? 'All' : s)}>
                                <div style={{ width: 7, height: 7, borderRadius: '50%', background: cfg.color }} />
                                {cfg.label}: {count}
                            </div>
                        );
                    })}
                    <div style={{ marginLeft: 'auto', fontSize: '0.78rem', color: 'var(--text-muted)', alignSelf: 'center' }}>
                        {totalScheduled} posts this month
                    </div>
                </div>

                {/* Day headers */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
                    {dayLabels.map(d => (
                        <div key={d} style={{
                            textAlign: 'center', fontSize: '0.7rem', fontWeight: 700,
                            color: 'var(--text-muted)', padding: '6px 0',
                            textTransform: 'uppercase', letterSpacing: '0.05em',
                        }}>{d}</div>
                    ))}
                </div>

                {/* Calendar days */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
                    {days.map((day) => {
                        const dayPosts = getPostsForDay(day);
                        const dayTasks = getTasksForDay(day);
                        const dayHolidays = showHolidays ? getHolidaysForDay(day) : [];
                        const isCurrentMonth = isSameMonth(day, currentDate);
                        const isSelected = selectedDate && isSameDay(day, selectedDate);

                        return (
                            <div
                                key={day.toISOString()}
                                onClick={() => handleDayClick(day)}
                                style={{
                                    height: 115, overflow: 'hidden', padding: '5px 6px',
                                    border: `1px solid ${isSelected ? 'var(--accent)' : isToday(day) ? 'rgba(37,99,235,0.3)' : 'var(--border)'}`,
                                    borderRadius: 6,
                                    background: isSelected ? 'var(--accent-glow)' : isToday(day) ? 'rgba(37,99,235,0.04)' : !isCurrentMonth ? 'var(--bg-tertiary)' : '#fff',
                                    opacity: !isCurrentMonth ? 0.45 : 1,
                                    cursor: 'pointer',
                                    transition: 'all 0.12s',
                                    position: 'relative',
                                }}
                                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.borderColor = 'var(--border-strong)'; }}
                                onMouseLeave={e => { if (!isSelected && !isToday(day)) e.currentTarget.style.borderColor = 'var(--border)'; }}
                            >
                                {/* Date number */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                                    <span style={{
                                        fontSize: '0.78rem', fontWeight: isToday(day) ? 800 : 500,
                                        color: isToday(day) ? '#fff' : 'var(--text-primary)',
                                        width: 22, height: 22, borderRadius: '50%',
                                        background: isToday(day) ? 'var(--accent)' : 'transparent',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}>
                                        {safeFormat(day, 'd')}
                                    </span>
                                    <div style={{ display: 'flex', gap: 2 }}>
                                        {dayPosts.length > 0 && (
                                            <span style={{ fontSize: '0.58rem', fontWeight: 700, padding: '1px 4px', background: 'var(--accent)', color: '#fff', borderRadius: 99 }}>
                                                {dayPosts.length}p
                                            </span>
                                        )}
                                        {dayTasks.length > 0 && (
                                            <span style={{ fontSize: '0.58rem', fontWeight: 700, padding: '1px 4px', background: '#10b981', color: '#fff', borderRadius: 99 }}>
                                                {dayTasks.length}t
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Holiday indicators */}
                                {dayHolidays.slice(0, 2).map((h, i) => (
                                    <div key={i} style={{
                                        fontSize: '0.55rem', fontWeight: 700, color: h.color, marginBottom: 2,
                                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                        display: 'flex', alignItems: 'center', gap: 2,
                                    }}>
                                        <Flag style={{ width: 7, height: 7, flexShrink: 0 }} />
                                        {h.name}
                                    </div>
                                ))}

                                {/* Post chips */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                    {dayPosts.slice(0, dayHolidays.length > 0 ? 1 : 2).map(p => {
                                        const cfg = STATUS_CONFIG[p.status] || STATUS_CONFIG.draft;
                                        return (
                                            <div
                                                key={p.id}
                                                onClick={e => { e.stopPropagation(); setSelectedPost(p); }}
                                                style={{
                                                    padding: '2px 5px', borderRadius: 3, fontSize: '0.6rem', fontWeight: 600,
                                                    background: cfg.bg, color: cfg.color,
                                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                    cursor: 'pointer', border: `1px solid ${cfg.color}30`,
                                                }}>
                                                {p.content?.slice(0, 22) || 'Post'}
                                            </div>
                                        );
                                    })}

                                    {/* Task chips */}
                                    {dayTasks.slice(0, 1).map(t => {
                                        const cfg = TASK_STATUS_CONFIG[t.status] || TASK_STATUS_CONFIG.pending;
                                        return (
                                            <div key={t.id} style={{
                                                padding: '2px 5px', borderRadius: 3, fontSize: '0.6rem', fontWeight: 600,
                                                background: cfg.bg, color: cfg.color,
                                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                display: 'flex', alignItems: 'center', gap: 3,
                                                border: `1px solid ${cfg.color}30`,
                                            }}>
                                                <CheckSquare style={{ width: 7, height: 7, flexShrink: 0 }} />
                                                {t.title?.slice(0, 20) || 'Task'}
                                            </div>
                                        );
                                    })}

                                    {(dayPosts.length + dayTasks.length) > 3 && (
                                        <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', paddingLeft: 2 }}>
                                            +{dayPosts.length + dayTasks.length - 3} more
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    // ── Week View ───────────────────────────────────────────────────────────
    const WeekView = () => {
        const wStart = startOfWk(currentDate, { weekStartsOn: 1 });
        const wEnd = endOfWk(currentDate, { weekStartsOn: 1 });
        const weekDays = eachDayOfInterval({ start: wStart, end: wEnd });

        return (
            <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
                    {weekDays.map(day => {
                        const dayPosts = getPostsForDay(day);
                        const dayTasks = getTasksForDay(day);
                        const dayHolidays = showHolidays ? getHolidaysForDay(day) : [];
                        return (
                            <div key={day.toISOString()} style={{
                                minHeight: 300,
                                border: `1px solid ${isToday(day) ? 'rgba(37,99,235,0.3)' : 'var(--border)'}`,
                                borderRadius: 8,
                                background: isToday(day) ? 'rgba(37,99,235,0.03)' : '#fff',
                                overflow: 'hidden',
                            }}>
                                <div style={{
                                    padding: '8px 10px',
                                    background: isToday(day) ? 'var(--accent)' : 'var(--bg-tertiary)',
                                    color: isToday(day) ? '#fff' : 'var(--text-secondary)',
                                    fontSize: '0.78rem', fontWeight: 700,
                                    borderBottom: '1px solid var(--border)',
                                }}>
                                    <div style={{ textTransform: 'uppercase', fontSize: '0.62rem', letterSpacing: '0.08em', opacity: 0.8 }}>{safeFormat(day, 'EEE')}</div>
                                    <div style={{ fontSize: '1.1rem', fontWeight: 800 }}>{safeFormat(day, 'd')}</div>
                                </div>
                                <div style={{ padding: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    {/* Holidays */}
                                    {dayHolidays.map((h, i) => (
                                        <div key={i} style={{
                                            padding: '4px 7px', fontSize: '0.62rem', fontWeight: 700,
                                            color: h.color, background: h.color + '15',
                                            borderRadius: 4, display: 'flex', alignItems: 'center', gap: 4,
                                        }}>
                                            <Flag style={{ width: 9, height: 9 }} /> {h.name}
                                        </div>
                                    ))}
                                    {/* Posts */}
                                    {dayPosts.map(p => {
                                        const cfg = STATUS_CONFIG[p.status] || STATUS_CONFIG.draft;
                                        return (
                                            <div key={p.id} onClick={() => setSelectedPost(p)} style={{
                                                padding: '6px 8px', background: cfg.bg, borderRadius: 5, cursor: 'pointer',
                                                borderLeft: `3px solid ${cfg.color}`,
                                                fontSize: '0.72rem', fontWeight: 600, color: cfg.color,
                                            }}>
                                                <div className="truncate" style={{ marginBottom: 2 }}>{p.content?.slice(0, 40) || 'Post'}</div>
                                                {p.scheduled_at && (
                                                    <div style={{ fontSize: '0.65rem', opacity: 0.8, display: 'flex', alignItems: 'center', gap: 3 }}>
                                                        <Clock style={{ width: 10, height: 10 }} /> {safeFormat(p.scheduled_at, 'HH:mm')}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                    {/* Tasks */}
                                    {dayTasks.map(t => {
                                        const cfg = TASK_STATUS_CONFIG[t.status] || TASK_STATUS_CONFIG.pending;
                                        return (
                                            <div key={t.id} onClick={() => handleDayClick(day)} style={{
                                                padding: '6px 8px', background: cfg.bg, borderRadius: 5, cursor: 'pointer',
                                                borderLeft: `3px solid ${cfg.color}`,
                                                fontSize: '0.72rem', fontWeight: 600, color: cfg.color,
                                                display: 'flex', gap: 5, alignItems: 'center',
                                            }}>
                                                <CheckSquare style={{ width: 11, height: 11, flexShrink: 0 }} />
                                                <span className="truncate">{t.title}</span>
                                            </div>
                                        );
                                    })}
                                    <button onClick={() => handleDayClick(day)} style={{
                                        width: '100%', padding: '5px', background: 'transparent',
                                        border: '1px dashed var(--border)', borderRadius: 5, cursor: 'pointer',
                                        fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'inherit',
                                        transition: 'all 0.12s',
                                    }} onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; }}
                                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)'; }}>
                                        + Add item
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    // ── List View ───────────────────────────────────────────────────────────
    const ListView = () => (
        <div className="table-wrapper">
            <table className="data-table">
                <thead>
                    <tr>
                        <th>Date / Time</th>
                        <th>Content Preview</th>
                        <th>Type</th>
                        <th>Region</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {filteredPosts.length === 0 ? (
                        <tr><td colSpan={6} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>No posts found</td></tr>
                    ) : filteredPosts.sort((a, b) => new Date(b.scheduled_at || b.created_at || 0).getTime() - new Date(a.scheduled_at || a.created_at || 0).getTime()).map(p => {
                        const cfg = STATUS_CONFIG[p.status] || STATUS_CONFIG.draft;
                        const dateStr = p.scheduled_at || p.created_at;
                        return (
                            <tr key={p.id}>
                                <td style={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                                    {dateStr ? (
                                        <>
                                            <div style={{ fontWeight: 600 }}>{safeFormat(dateStr, 'MMM d, yyyy')}</div>
                                            <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>{safeFormat(dateStr, 'HH:mm')}</div>
                                        </>
                                    ) : '—'}
                                </td>
                                <td>
                                    <div style={{ maxWidth: 320, fontSize: '0.82rem' }} className="truncate">{p.content?.slice(0, 100)}</div>
                                </td>
                                <td><span className="badge badge-gray">{p.post_type || 'post'}</span></td>
                                <td><span className="badge badge-info">{p.region || 'Global'}</span></td>
                                <td>
                                    <span className="badge" style={{ background: cfg.bg, color: cfg.color }}>
                                        {cfg.label}
                                    </span>
                                </td>
                                <td>
                                    <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setSelectedPost(p)} title="View">
                                        <Edit3 size={13} />
                                    </button>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );

    const navigatePrev = () => {
        if (viewMode === 'month') setCurrentDate(subMonths(currentDate, 1));
        else if (viewMode === 'week') setCurrentDate(subWeeks(currentDate, 1));
    };

    const navigateNext = () => {
        if (viewMode === 'month') setCurrentDate(addMonths(currentDate, 1));
        else if (viewMode === 'week') setCurrentDate(addWeeks(currentDate, 1));
    };

    const getViewLabel = () => {
        if (viewMode === 'month') return safeFormat(currentDate, 'MMMM yyyy');
        if (viewMode === 'week') {
            const ws = startOfWk(currentDate, { weekStartsOn: 1 });
            const we = endOfWk(currentDate, { weekStartsOn: 1 });
            return `${safeFormat(ws, 'MMM d')} – ${safeFormat(we, 'MMM d, yyyy')}`;
        }
        return 'All Posts';
    };

    // ── Day Panel (right-side drawer) ────────────────────────────────────────
    const dayPanelPosts = selectedDate ? getPostsForDay(selectedDate) : [];
    const dayPanelTasks = selectedDate ? getTasksForDay(selectedDate) : [];
    const dayPanelHolidays = selectedDate && showHolidays ? getHolidaysForDay(selectedDate) : [];

    return (
        <div className="page-content animate-fade" style={{ position: 'relative' }}>
            {/* Header */}
            <div className="page-header">
                <div className="page-header-left">
                    <div className="page-title">Content Calendar</div>
                    <div className="page-subtitle">Schedule, manage and track your LinkedIn content pipeline</div>
                </div>
                <div className="page-header-right">
                    <button className="btn btn-primary" onClick={() => { setSelectedDate(new Date()); setShowDayPanel(true); setShowTaskForm(false); }}>
                        <Plus size={15} /> Schedule Post
                    </button>
                </div>
            </div>

            {/* Toolbar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
                {/* Navigation */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button className="btn btn-secondary btn-icon btn-sm" onClick={navigatePrev}><ChevronLeft size={16} /></button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setCurrentDate(new Date())} style={{ minWidth: 140, fontWeight: 600, fontSize: '0.85rem' }}>
                        {getViewLabel()}
                    </button>
                    <button className="btn btn-secondary btn-icon btn-sm" onClick={navigateNext}><ChevronRight size={16} /></button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setCurrentDate(new Date())} style={{ color: 'var(--accent)', fontWeight: 600 }}>Today</button>
                </div>

                {/* Filters + toggles */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    {/* Holiday toggle */}
                    <button
                        className={`btn btn-sm ${showHolidays ? 'btn-secondary' : 'btn-ghost'}`}
                        onClick={() => setShowHolidays(v => !v)}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.75rem' }}
                        title="Toggle holiday overlay"
                    >
                        <Flag size={12} /> Holidays
                    </button>

                    {showHolidays && (
                        <select className="select" style={{ width: 'auto', fontSize: '0.75rem', padding: '5px 8px' }}
                            value={holidayRegionFilter}
                            onChange={e => setHolidayRegionFilter(e.target.value)}>
                            <option value="All">All Regions</option>
                            {REGIONS.map(r => <option key={r}>{r}</option>)}
                        </select>
                    )}

                    <select className="select" style={{ width: 'auto', fontSize: '0.78rem', padding: '6px 10px' }} value={filterRegion} onChange={e => setFilterRegion(e.target.value)}>
                        {REGIONS.map(r => <option key={r}>{r}</option>)}
                    </select>
                    <select className="select" style={{ width: 'auto', fontSize: '0.78rem', padding: '6px 10px' }} value={filterType} onChange={e => setFilterType(e.target.value)}>
                        {POST_TYPES.map(t => <option key={t}>{t}</option>)}
                    </select>
                    <select className="select" style={{ width: 'auto', fontSize: '0.78rem', padding: '6px 10px' }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                        <option value="All">All Statuses</option>
                        {Object.entries(STATUS_CONFIG).map(([s, c]) => <option key={s} value={s}>{c.label}</option>)}
                    </select>

                    {/* View mode tabs */}
                    <div className="tabs" style={{ width: 'auto' }}>
                        {(['month', 'week', 'list'] as ViewMode[]).map(v => (
                            <button key={v} className={`tab ${viewMode === v ? 'active' : ''}`} onClick={() => setViewMode(v)} style={{ textTransform: 'capitalize', minWidth: 52 }}>{v}</button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Main layout — calendar + optional day panel */}
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                {/* Calendar Body */}
                <div style={{ flex: 1, minWidth: 0 }}>
                    {loading ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
                            <div className="spinner" style={{ width: 28, height: 28 }} />
                        </div>
                    ) : (
                        <div className="animate-fade">
                            {viewMode === 'month' && <MonthView />}
                            {viewMode === 'week' && <WeekView />}
                            {viewMode === 'list' && <ListView />}
                        </div>
                    )}
                </div>

                {/* Day Panel Drawer */}
                {showDayPanel && selectedDate && (
                    <div style={{
                        width: 320, flexShrink: 0,
                        background: '#fff', border: '1px solid var(--border)',
                        borderRadius: 12, overflow: 'hidden',
                        boxShadow: 'var(--shadow-lg)',
                        animation: 'slideInRight 0.2s ease both',
                    }}>
                        {/* Panel Header */}
                        <div style={{
                            padding: '14px 16px', borderBottom: '1px solid var(--border)',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            background: 'var(--bg-tertiary)',
                        }}>
                            <div>
                                <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                                    {safeFormat(selectedDate, 'MMMM d, yyyy')}
                                </div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                                    {safeFormat(selectedDate, 'EEEE')}
                                </div>
                            </div>
                            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowDayPanel(false)}>
                                <X size={16} />
                            </button>
                        </div>

                        <div style={{ padding: 14, overflowY: 'auto', maxHeight: 'calc(100vh - 300px)' }}>
                            {/* Holidays */}
                            {dayPanelHolidays.length > 0 && (
                                <div style={{ marginBottom: 16 }}>
                                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                                        🎌 Holidays
                                    </div>
                                    {dayPanelHolidays.map((h, i) => (
                                        <div key={i} style={{
                                            padding: '7px 10px', marginBottom: 4, borderRadius: 7,
                                            background: h.color + '12', border: `1px solid ${h.color}30`,
                                            display: 'flex', alignItems: 'center', gap: 8,
                                        }}>
                                            <span style={{ fontSize: '0.85rem' }}>{REGION_FLAG[h.region] || '🌐'}</span>
                                            <div>
                                                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: h.color }}>{h.name}</div>
                                                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{h.region}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Posts on this day */}
                            <div style={{ marginBottom: 16 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                        📝 Posts ({dayPanelPosts.length})
                                    </div>
                                    <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.7rem', padding: '3px 8px' }}
                                        onClick={() => { setShowCreateModal(true); setShowDayPanel(false); }}>
                                        <Plus size={11} /> Add
                                    </button>
                                </div>
                                {dayPanelPosts.length === 0 ? (
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>No posts scheduled</div>
                                ) : dayPanelPosts.map((p, idx) => {
                                    const cfg = STATUS_CONFIG[p.status] || STATUS_CONFIG.draft || { label: 'Draft', color: '#94a3b8', bg: '#f1f5f9' };
                                    return (
                                        <div key={p.id || idx} style={{
                                            padding: '8px 10px', marginBottom: 6, borderRadius: 7,
                                            background: cfg.bg, border: `1px solid ${cfg.color}30`,
                                            cursor: 'pointer',
                                        }} onClick={() => { setSelectedPost(p); setShowDayPanel(false); }}>
                                            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: cfg.color, marginBottom: 4 }}>
                                                <span className="badge" style={{ background: 'transparent', color: cfg.color, padding: 0, fontSize: '0.68rem' }}>{cfg.label}</span>
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-primary)', lineHeight: 1.5 }}>
                                                {p.content?.slice(0, 80)}{p.content?.length > 80 ? '...' : ''}
                                            </div>
                                            {p.scheduled_at && (
                                                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 3 }}>
                                                    <Clock size={9} /> {safeFormat(p.scheduled_at, 'HH:mm')}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Tasks due on this day */}
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                        ✅ Tasks ({dayPanelTasks.length})
                                    </div>
                                    {isAdmin && (
                                        <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.7rem', padding: '3px 8px' }}
                                            onClick={() => setShowTaskForm(v => !v)}>
                                            <Plus size={11} /> Add
                                        </button>
                                    )}
                                </div>

                                {/* Quick add task form */}
                                {showTaskForm && isAdmin && (
                                    <div style={{ padding: '10px', marginBottom: 10, background: 'var(--bg-tertiary)', borderRadius: 8, border: '1px solid var(--border)' }}>
                                        <input
                                            className="input" style={{ marginBottom: 8, fontSize: '0.78rem' }}
                                            placeholder="Task title..."
                                            value={newTask.title}
                                            onChange={e => setNewTask(t => ({ ...t, title: e.target.value }))}
                                            onKeyDown={e => e.key === 'Enter' && handleCreateTask()}
                                        />
                                        <select className="select" style={{ marginBottom: 8, fontSize: '0.75rem' }}
                                            value={newTask.priority}
                                            onChange={e => setNewTask(t => ({ ...t, priority: e.target.value }))}>
                                            <option value="low">Low Priority</option>
                                            <option value="medium">Medium Priority</option>
                                            <option value="high">High Priority</option>
                                        </select>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            <button className="btn btn-primary btn-sm" style={{ flex: 1, fontSize: '0.72rem' }} onClick={handleCreateTask}>Add Task</button>
                                            <button className="btn btn-ghost btn-sm" onClick={() => setShowTaskForm(false)}><X size={12} /></button>
                                        </div>
                                    </div>
                                )}

                                {dayPanelTasks.length === 0 && !showTaskForm ? (
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>No tasks due</div>
                                ) : dayPanelTasks.map((t, idx) => {
                                    const cfg = TASK_STATUS_CONFIG[t.status] || TASK_STATUS_CONFIG.pending || { label: 'Pending', color: '#94a3b8', bg: '#f1f5f9' };
                                    const priorityColor = t.priority === 'high' ? '#ef4444' : t.priority === 'medium' ? '#f59e0b' : '#94a3b8';
                                    return (
                                        <div key={t.id || idx} style={{
                                            padding: '8px 10px', marginBottom: 6, borderRadius: 7,
                                            background: cfg.bg, border: `1px solid ${cfg.color}30`,
                                            display: 'flex', alignItems: 'flex-start', gap: 8,
                                        }}>
                                            <CheckSquare style={{ width: 14, height: 14, color: cfg.color, flexShrink: 0, marginTop: 2 }} />
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3 }}>{t.title}</div>
                                                <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                                                    <span className="badge" style={{ background: cfg.bg, color: cfg.color, fontSize: '0.6rem' }}>{cfg.label}</span>
                                                    <Star style={{ width: 9, height: 9, color: priorityColor }} />
                                                    <span style={{ fontSize: '0.62rem', color: priorityColor, textTransform: 'capitalize' }}>{t.priority}</span>
                                                </div>
                                            </div>
                                            {isAdmin && (
                                                <button
                                                    className="btn btn-ghost btn-icon btn-sm"
                                                    style={{ padding: 3, color: 'var(--danger)' }}
                                                    onClick={() => handleDeleteTask(t.id)}
                                                    title="Delete task"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Panel Footer */}
                        <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
                            <button className="btn btn-primary btn-sm" style={{ flex: 1 }}
                                onClick={() => { setShowCreateModal(true); setShowDayPanel(false); }}>
                                <Plus size={13} /> Schedule Post
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Post Detail Modal */}
            {selectedPost && (
                <div className="modal-overlay" onClick={() => setSelectedPost(null)}>
                    <div className="modal-box" onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                            <h3>Post Details</h3>
                            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setSelectedPost(null)}><X size={16} /></button>
                        </div>
                        <div>
                            {(() => {
                                const cfg = STATUS_CONFIG[selectedPost.status] || STATUS_CONFIG.draft;
                                return (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                            <span className="badge" style={{ background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                                            <span className="badge badge-info">{selectedPost.region || 'Global'}</span>
                                            <span className="badge badge-gray">{selectedPost.post_type || 'post'}</span>
                                        </div>
                                        <div style={{ background: 'var(--bg-tertiary)', borderRadius: 8, padding: '14px', fontSize: '0.85rem', color: 'var(--text-primary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                                            {selectedPost.content}
                                        </div>
                                        {(() => {
                                            if (!selectedPost.hashtags) return null;
                                            let tags: string[] = [];
                                            if (Array.isArray(selectedPost.hashtags)) {
                                                tags = selectedPost.hashtags;
                                            } else if (typeof selectedPost.hashtags === 'string') {
                                                try {
                                                    const parsed = JSON.parse(selectedPost.hashtags);
                                                    if (Array.isArray(parsed)) tags = parsed;
                                                    else tags = selectedPost.hashtags.split(/[ ,]+/).filter(Boolean);
                                                } catch {
                                                    tags = selectedPost.hashtags.split(/[ ,]+/).filter(Boolean);
                                                }
                                            }
                                            if (tags.length === 0) return null;
                                            return (
                                                <div style={{ fontSize: '0.82rem', color: 'var(--accent)', fontWeight: 600 }}>
                                                    {tags.map(t => t.startsWith('#') ? t : `#${t}`).join(' ')}
                                                </div>
                                            );
                                        })()}
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                            <div>
                                                <div className="form-label">Scheduled At</div>
                                                <div style={{ fontSize: '0.85rem', fontWeight: 600, marginTop: 4 }}>
                                                    {selectedPost.scheduled_at ? safeFormat(selectedPost.scheduled_at, 'MMM d, yyyy HH:mm') : 'Not scheduled'}
                                                </div>
                                            </div>
                                            <div>
                                                <div className="form-label">Created</div>
                                                <div style={{ fontSize: '0.85rem', fontWeight: 600, marginTop: 4 }}>
                                                    {selectedPost.created_at ? safeFormat(selectedPost.created_at, 'MMM d, yyyy') : '—'}
                                                </div>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            {[['var(--accent)', selectedPost.likes || 0, 'Likes'], ['var(--purple)', selectedPost.impressions || 0, 'Impressions'], ['var(--success)', selectedPost.shares || 0, 'Shares']].map(([color, val, label]) => (
                                                <div key={label as string} style={{ textAlign: 'center', flex: 1, padding: '10px', background: 'var(--bg-tertiary)', borderRadius: 8 }}>
                                                    <div style={{ fontSize: '1.3rem', fontWeight: 800, color: color as string }}>{val as number}</div>
                                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{label as string}</div>
                                                </div>
                                            ))}
                                        </div>

                                        {isAdmin && (
                                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                                                <button
                                                    onClick={() => handleDeletePost(selectedPost.id)}
                                                    className="btn btn-sm btn-ghost"
                                                    style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 4 }}
                                                >
                                                    <Trash2 size={13} /> Delete Post
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                </div>
            )}

            {/* Create Post Modal */}
            {showCreateModal && (
                <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
                    <div className="modal-box modal-box-wide" onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                            <h3>Schedule New Post</h3>
                            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowCreateModal(false)}><X size={16} /></button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <div className="form-group">
                                <label className="form-label">Content *</label>
                                <textarea className="textarea" rows={5} placeholder="Write your LinkedIn post content here..." value={newPost.content} onChange={e => setNewPost(p => ({ ...p, content: e.target.value }))} />
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', alignSelf: 'flex-end' }}>{newPost.content.length} / 3000 chars</div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <div className="form-group">
                                    <label className="form-label">Post Type</label>
                                    <select className="select" value={newPost.post_type} onChange={e => setNewPost(p => ({ ...p, post_type: e.target.value }))}>
                                        {POST_TYPES.filter(t => t !== 'All').map(t => <option key={t}>{t}</option>)}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Region</label>
                                    <select className="select" value={newPost.region} onChange={e => setNewPost(p => ({ ...p, region: e.target.value }))}>
                                        {REGIONS.map(r => <option key={r}>{r}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <div className="form-group">
                                    <label className="form-label">Scheduled Date & Time</label>
                                    <input className="input" type="datetime-local" value={newPost.scheduled_at} onChange={e => setNewPost(p => ({ ...p, scheduled_at: e.target.value }))} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Status</label>
                                    <select className="select" value={newPost.status} onChange={e => setNewPost(p => ({ ...p, status: e.target.value }))}>
                                        <option value="draft">Draft</option>
                                        {isAdmin && <option value="approved">Approved</option>}
                                        {isAdmin && <option value="scheduled">Scheduled</option>}
                                    </select>
                                </div>
                            </div>

                            {selectedDate && (
                                <div style={{ padding: '10px 14px', background: 'var(--accent-glow)', borderRadius: 8, border: '1px solid rgba(37,99,235,0.2)', fontSize: '0.8rem', color: 'var(--accent)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <Calendar size={14} /> Scheduling for {safeFormat(selectedDate, 'EEEE, MMMM d, yyyy')}
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                                <button className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>Cancel</button>
                                <button className="btn btn-primary" onClick={handleCreatePost}>
                                    <Send size={14} /> {isAdmin ? 'Schedule Post' : 'Submit for Review'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
