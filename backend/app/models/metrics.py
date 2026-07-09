import uuid
from datetime import datetime
from sqlalchemy import String, Integer, Float, DateTime, ForeignKey, func, Date, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class PageMetric(Base):
    __tablename__ = "page_metrics"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    metric_date: Mapped[datetime] = mapped_column(Date, nullable=False, index=True)
    page_id: Mapped[str] = mapped_column(String(100), default="main")
    region: Mapped[str] = mapped_column(String(50), default="Global", index=True)
    followers: Mapped[int] = mapped_column(Integer, default=0)
    followers_gained: Mapped[int] = mapped_column(Integer, default=0)
    followers_lost: Mapped[int] = mapped_column(Integer, default=0)
    visitors: Mapped[int] = mapped_column(Integer, default=0)
    impressions: Mapped[int] = mapped_column(Integer, default=0)
    likes: Mapped[int] = mapped_column(Integer, default=0)
    comments: Mapped[int] = mapped_column(Integer, default=0)
    shares: Mapped[int] = mapped_column(Integer, default=0)
    clicks: Mapped[int] = mapped_column(Integer, default=0)
    engagement_rate: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class PostMetric(Base):
    __tablename__ = "post_metrics"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    post_id: Mapped[str] = mapped_column(String(36), ForeignKey("posts.id"), nullable=False, index=True)
    metric_date: Mapped[datetime] = mapped_column(Date, nullable=False)
    impressions: Mapped[int] = mapped_column(Integer, default=0)
    likes: Mapped[int] = mapped_column(Integer, default=0)
    comments: Mapped[int] = mapped_column(Integer, default=0)
    shares: Mapped[int] = mapped_column(Integer, default=0)
    clicks: Mapped[int] = mapped_column(Integer, default=0)
    engagement_velocity: Mapped[float] = mapped_column(Float, default=0.0)  # first-hour momentum
    sentiment_score: Mapped[float] = mapped_column(Float, default=0.0)  # comment sentiment
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    post = relationship("Post")


class AudienceDemographic(Base):
    __tablename__ = "audience_demographics"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    snapshot_date: Mapped[datetime] = mapped_column(Date, nullable=False)
    region: Mapped[str] = mapped_column(String(50), default="Global")
    country: Mapped[str] = mapped_column(String(100), default="")
    seniority: Mapped[str] = mapped_column(String(100), default="")  # Entry/Mid/Senior/Director/VP
    industry: Mapped[str] = mapped_column(String(255), default="")
    function: Mapped[str] = mapped_column(String(255), default="")
    company_size: Mapped[str] = mapped_column(String(50), default="")
    follower_count: Mapped[int] = mapped_column(Integer, default=0)
    non_follower_reach: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class FollowerSnapshot(Base):
    """One row per calendar day — the follower count at the time of the last
    LinkedIn sync for that day.  Used to compute daily/weekly deltas without
    needing access to LinkedIn's (unavailable) historical API."""

    __tablename__ = "follower_snapshots"
    __table_args__ = (UniqueConstraint("snapshot_date", name="uq_follower_snapshot_date"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    snapshot_date: Mapped[datetime] = mapped_column(Date, nullable=False, index=True)
    followers: Mapped[int] = mapped_column(Integer, nullable=False)
    organic_followers: Mapped[int] = mapped_column(Integer, default=0)
    paid_followers: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())
