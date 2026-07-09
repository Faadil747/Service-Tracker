export type UserRole = 'developer' | 'agent' | 'admin';
export type Region = 'India' | 'USA' | 'Indonesia' | 'Global';

export interface User {
    id: string;
    email: string;
    full_name: string;
    role: UserRole;
    region: Region;
    avatar_url: string;
    linkedin_url: string;
    is_active: boolean;
}

export type TaskStatus = 'pending_approval' | 'active' | 'in_progress' | 'completed' | 'rejected' | 'overdue' | 'on_hold';
export type PostStatus = 'draft' | 'in_review' | 'approved' | 'scheduled' | 'published' | 'rejected';
export type PostType = 'job_posting' | 'jd_post' | 'industry_tip' | 'ai_carousel' | 'resume_advice' | 'general';

export interface Task {
    id: string;
    title: string;
    description: string;
    status: TaskStatus;
    region: Region | string;
    due_date: string | null;
    recurrence: string;
    created_by_id: string;
    completed_at: string | null;
    created_at: string;
    assignments: { agent_id: string }[];
    claimed_by_id?: string;
    claimed_by_name?: string;
    post?: {
        id: string;
        title: string;
        content: string;
        status: string;
        tone?: string;
        hashtags?: string;
        image_url?: string;
        review_comment?: string;
    } | null;
}

export interface Post {
    id: string;
    title: string;
    content: string;
    status: PostStatus;
    post_type: PostType;
    region: Region | string;
    tone: string;
    hashtags: string;
    image_url: string;
    is_template: boolean;
    scheduled_at: string | null;
    published_at: string | null;
    created_by_id: string;
    created_at: string;
    campaign_id: string | null;
    task_id?: string | null;
    predicted_reach: number;
    review_comment?: string;
    linkedin_post_id?: string;
}

export interface PageMetric {
    id: string;
    metric_date: string;
    region: string;
    followers: number;
    followers_gained: number;
    followers_lost: number;
    visitors: number;
    impressions: number;
    likes: number;
    comments: number;
    shares: number;
    clicks: number;
    engagement_rate: number;
}

export interface Notification {
    id: string;
    type: string;
    title: string;
    body: string;
    is_read: boolean;
    reference_id: string;
    reference_type: string;
    created_at: string;
}

export interface Alert {
    id: string;
    raised_by_id: string;
    raised_by_name?: string;
    title: string;
    body: string;
    priority: 'high' | 'critical';
    status: 'open' | 'resolved';
    region: string;
    reference_id?: string;
    reference_type?: string;
    created_at: string;
    resolved_at: string | null;
}

export interface DashboardSummary {
    total_followers: number;
    weekly_growth: number;
    avg_engagement_rate: number;
    sparkline: { date: string; value: number }[];
}

export interface HeatmapCell {
    day: string;
    hour: number;
    engagement: number;
}

export interface LinkTracking {
    id: string;
    post_id: string | null;
    short_code: string;
    short_url: string;
    original_url: string;
    utm_campaign: string;
    utm_source: string;
    utm_medium: string;
    region: string;
    total_clicks: number;
    created_at: string;
}

export interface KanbanBoard {
    draft: Post[];
    rejected: Post[];
    in_review: Post[];
    approved: Post[];
    scheduled: Post[];
}
