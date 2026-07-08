"""
Seed data for the dev/test role.
Run: python -m app.seed.seed_data
Creates mock users (all 3 roles), tasks, posts, metrics, notifications.
"""
import asyncio
import uuid
import json
from datetime import datetime, timedelta, date
import random

from app.database import AsyncSessionLocal, init_db
from app.models import User, Task, TaskAssignment, TaskCompletion, Post, PostStatus, PostType, Notification, Alert, Campaign
from app.services.auth_service import hash_password

# Re-import enums correctly
from app.models.task import TaskStatus
from app.models.post import PostStatus, PostType


REGIONS = ["India", "USA", "Indonesia"]
SENIORITIES = ["Entry", "Mid-Senior", "Director", "VP", "C-Suite"]
INDUSTRIES = ["Technology", "Staffing and Recruiting", "IT Services", "Human Resources", "Financial Services"]


async def seed():
    # ── Deterministic Random Seed ───────────────────────────
    random.seed(42)
    
    # ── Deterministic Baseline Date ─────────────────────────
    # Lock current date to a static value so date offsets are identical
    baseline_date = date(2026, 7, 8)
    baseline_datetime = datetime(2026, 7, 8, 12, 0, 0)
    
    # Helper to generate deterministic UUID strings from namespace names
    # This ensures identical IDs across multiple machine setups
    def make_uuid(name: str) -> str:
        return str(uuid.uuid5(uuid.NAMESPACE_DNS, name))

    await init_db()
    async with AsyncSessionLocal() as db:
        # ── Users ──────────────────────────────────────────────
        admin = User(
            id=make_uuid("user_admin"),
            email="admin@gorecruitai.com",
            full_name="Sarah Mitchell (Admin)",
            hashed_password=hash_password("Admin@123"),
            role="admin",
            region="Global",
            linkedin_url="https://linkedin.com/in/sarah-mitchell",
            avatar_url=""
        )
        ceo = User(
            id=make_uuid("user_ceo"),
            email="ceo@gorecruitai.com",
            full_name="James Techwaukee (CEO)",
            hashed_password=hash_password("Ceo@1234"),
            role="admin",
            region="Global"
        )
        dev = User(
            id=make_uuid("user_dev"),
            email="dev@gorecruitai.com",
            full_name="Dev Sandbox",
            hashed_password=hash_password("Dev@1234"),
            role="developer",
            region="Global"
        )

        agents = [
            User(id=make_uuid("user_priya"), email="priya@gorecruitai.com", full_name="Priya Sharma", hashed_password=hash_password("Agent@123"), role="agent", region="India"),
            User(id=make_uuid("user_john"), email="john@gorecruitai.com", full_name="John Martinez", hashed_password=hash_password("Agent@123"), role="agent", region="USA"),
            User(id=make_uuid("user_budi"), email="budi@gorecruitai.com", full_name="Budi Santoso", hashed_password=hash_password("Agent@123"), role="agent", region="Indonesia"),
            User(id=make_uuid("user_aisha"), email="aisha@gorecruitai.com", full_name="Aisha Khan", hashed_password=hash_password("Agent@123"), role="agent", region="India"),
        ]

        for u in [admin, ceo, dev] + agents:
            db.add(u)
        await db.flush()

        # ── Campaigns ──────────────────────────────────────────
        campaigns = [
            Campaign(
                id=make_uuid("campaign_q3"),
                name="Q3 Tech Hiring Push",
                region="India",
                start_date=baseline_date - timedelta(days=30),
                end_date=baseline_date + timedelta(days=30),
                goal="Hire 50 engineers",
                created_by_id=admin.id
            ),
            Campaign(
                id=make_uuid("campaign_usa"),
                name="USA Remote Talent Drive",
                region="USA",
                start_date=baseline_date - timedelta(days=20),
                end_date=baseline_date + timedelta(days=40),
                goal="Fill 20 remote positions",
                created_by_id=admin.id
            ),
        ]
        for c in campaigns:
            db.add(c)
        await db.flush()

        # ── Tasks ──────────────────────────────────────────────
        task_templates = [
            ("Post 3 LinkedIn job updates", "Share open roles on the company page", "India"),
            ("Engage with top talent comments", "Reply to comments on recent posts to drive engagement", "USA"),
            ("Create a hiring carousel post", "Design and publish a carousel showcasing our open roles", "India"),
            ("Schedule weekly content", "Plan and queue 5 posts for next week across all regions", "Global"),
            ("Update company page banner", "Refresh the LinkedIn banner with Q3 messaging", "Indonesia"),
            ("Respond to DMs", "Reply to talent inquiries in company inbox", "USA"),
            ("Publish AI tips post", "Create a post about using AI in job searching", "India"),
            ("Analyze top-performing posts", "Review last month engagement and prepare report", "Global"),
        ]

        tasks = []
        for i, (title, desc, region) in enumerate(task_templates):
            status = random.choice([TaskStatus.active, TaskStatus.completed, TaskStatus.active, TaskStatus.in_progress])
            due = baseline_datetime + timedelta(days=random.randint(-2, 7))
            completed_at = baseline_datetime - timedelta(hours=random.randint(1, 48)) if status == TaskStatus.completed else None
            t = Task(
                id=make_uuid(f"task_{i}"),
                title=title,
                description=desc,
                status=status,
                region=region,
                due_date=due,
                created_by_id=admin.id,
                completed_at=completed_at,
                campaign_id=campaigns[i % 2].id if i < 4 else None,
            )
            tasks.append(t)
            db.add(t)
        await db.flush()

        # Assign tasks to agents
        for i, task in enumerate(tasks):
            agent = agents[i % len(agents)]
            db.add(TaskAssignment(id=make_uuid(f"assignment_{i}"), task_id=task.id, agent_id=agent.id))
            if task.status == TaskStatus.completed:
                db.add(TaskCompletion(id=make_uuid(f"completion_{i}"), task_id=task.id, agent_id=agent.id, completed_at=task.completed_at))

        # Pending approval task from agent
        pending_task = Task(
            id=make_uuid("task_pending_1"),
            title="Create Instagram-style carousel for LinkedIn",
            description="Design a 5-slide carousel for our India team",
            status=TaskStatus.pending_approval,
            region="India",
            due_date=baseline_datetime + timedelta(days=3),
            created_by_id=agents[0].id
        )
        db.add(pending_task)
        await db.flush()

        # ── Posts ──────────────────────────────────────────────
        post_contents = [
            ("🚀 We're Hiring! Senior Software Engineers at GOrecruitAI — India 🇮🇳\n\nAre you passionate about AI-driven recruiting technology? Join us!\n\n✅ Competitive salary\n✅ Remote-friendly\n✅ Amazing team culture\n\n#Hiring #SoftwareEngineer #AIJobs #GOrecruitAI #India", "India", PostType.job_posting, PostStatus.published),
            ("💡 3 AI Tools Every Recruiter Should Know in 2024\n\n1️⃣ Resume parsing AI — screens 1000 CVs in seconds\n2️⃣ Interview scheduling bots — eliminates the back-and-forth\n3️⃣ Sentiment analysis — reads candidate enthusiasm\n\nSave this post! 🔖\n#HRTech #AIRecruitment #RecruitmentTips", "USA", PostType.industry_tip, PostStatus.published),
            ("🌟 Are you a developer looking for your next big opportunity in Indonesia?\n\nGOrecruitAI is expanding our Jakarta office!\n\n📍 Jakarta / Hybrid\n💰 Market-rate + equity\n🤝 English-speaking environment\n\nDM us or click below! 👇\n#IndonesiaJobs #TechJobs #Jakarta", "Indonesia", PostType.job_posting, PostStatus.scheduled),
            ("📊 Resume Tips that actually get callbacks:\n\n✓ Quantify achievements (increased sales by 34%, not 'improved sales')\n✓ Keywords matching job description\n✓ Clean 1-page format for <10 years experience\n✓ ATS-friendly formatting\n\nShare with someone job hunting! 💪\n#ResumeTips #CareerAdvice #JobSearch", "Global", PostType.resume_advice, PostStatus.approved),
            ("Draft: Case study post about AI carousel recruitment at GOrecruitAI - needs images", "India", PostType.ai_carousel, PostStatus.draft),
        ]

        for idx, (content, region, ptype, pstatus) in enumerate(post_contents):
            p = Post(
                id=make_uuid(f"post_{idx}"),
                title=content[:60],
                content=content,
                region=region,
                post_type=ptype,
                status=pstatus,
                tone="professional",
                hashtags=json.dumps(["GOrecruitAI", "Hiring", "Jobs"]),
                created_by_id=agents[0].id if pstatus != PostStatus.draft else agents[1].id,
                published_at=baseline_datetime - timedelta(days=random.randint(1, 15)) if pstatus == PostStatus.published else None,
                scheduled_at=baseline_datetime + timedelta(days=2) if pstatus == PostStatus.scheduled else None,
                predicted_reach=random.randint(800, 5000),
            )
            db.add(p)

        # ── Page Metrics & Audience Demographics ────────────────
        # Intentionally NOT seeded. All company-page analytics (followers,
        # impressions, engagement, demographics) come live from the real LinkedIn
        # API via app.services.linkedin_service — seeding random numbers here would
        # dilute/override the real data on the dashboard. Post metrics are likewise
        # not seeded (LinkedIn does not expose per-post engagement to this token).

        # ── Notifications for seeded users ─────────────────────
        for idx, agent in enumerate(agents):
            db.add(Notification(id=make_uuid(f"notif_agent_{idx}"), user_id=agent.id, type="task_assigned", title="New task assigned to you", body="Please complete this by EOD", is_read=False))
        db.add(Notification(id=make_uuid("notif_admin"), user_id=admin.id, type="pending_approval", title="Task pending approval", body="Priya submitted a new task for review", is_read=False))

        # ── Alerts ─────────────────────────────────────────────
        db.add(Alert(id=make_uuid("alert_1"), raised_by_id=agents[0].id, title="LinkedIn page access revoked", body="Unable to post — access token may have expired. Please check API settings.", priority="critical", region="India", status="open"))
        db.add(Alert(id=make_uuid("alert_2"), raised_by_id=agents[1].id, title="Negative comment spike on last post", body="Multiple negative comments received in the last hour on the Remote Work post.", priority="high", region="USA", status="open"))

        await db.commit()
        print("Seed data loaded successfully!")
        print("\nDemo accounts:")
        print("  Admin:  admin@gorecruitai.com / Admin@123")
        print("  CEO:    ceo@gorecruitai.com / Ceo@1234")
        print("  Agent:  priya@gorecruitai.com / Agent@123")
        print("  Dev:    dev@gorecruitai.com / Dev@1234")


if __name__ == "__main__":
    asyncio.run(seed())
