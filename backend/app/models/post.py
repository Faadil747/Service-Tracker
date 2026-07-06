import enum
import uuid
from datetime import datetime
from sqlalchemy import String, Enum as SAEnum, DateTime, ForeignKey, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class PostStatus(str, enum.Enum):
    draft = "draft"
    in_review = "in_review"
    approved = "approved"
    scheduled = "scheduled"
    published = "published"
    rejected = "rejected"


class PostType(str, enum.Enum):
    job_posting = "job_posting"
    jd_post = "jd_post"
    industry_tip = "industry_tip"
    ai_carousel = "ai_carousel"
    resume_advice = "resume_advice"
    general = "general"


class Post(Base):
    __tablename__ = "posts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    title: Mapped[str] = mapped_column(String(500), default="")
    content: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[PostStatus] = mapped_column(SAEnum(PostStatus), default=PostStatus.draft, index=True)
    post_type: Mapped[PostType] = mapped_column(SAEnum(PostType), default=PostType.general)
    region: Mapped[str] = mapped_column(String(50), default="Global", index=True)
    scheduled_at: Mapped[datetime] = mapped_column(DateTime, nullable=True, index=True)
    published_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    linkedin_post_id: Mapped[str] = mapped_column(String(255), default="")
    image_url: Mapped[str] = mapped_column(String(500), default="")
    hashtags: Mapped[str] = mapped_column(Text, default="")  # JSON string
    tone: Mapped[str] = mapped_column(String(50), default="professional")
    campaign_id: Mapped[str] = mapped_column(String(36), ForeignKey("campaigns.id"), nullable=True)
    created_by_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    approved_by_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    is_template: Mapped[bool] = mapped_column(default=False)
    ab_variant: Mapped[str] = mapped_column(String(10), default="")  # A/B testing
    predicted_reach: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    creator = relationship("User", foreign_keys=[created_by_id], back_populates="posts")
    approver = relationship("User", foreign_keys=[approved_by_id])
    campaign = relationship("Campaign", back_populates="posts")
    drafts = relationship("PostDraft", back_populates="post", cascade="all, delete-orphan")
    comments = relationship("Comment", primaryjoin="and_(Comment.entity_type=='post', foreign(Comment.entity_id)==Post.id)", overlaps="")
    link_trackings = relationship("LinkTracking", back_populates="post")


class PostDraft(Base):
    __tablename__ = "post_drafts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    post_id: Mapped[str] = mapped_column(String(36), ForeignKey("posts.id"), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    version: Mapped[int] = mapped_column(default=1)
    created_by_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    post = relationship("Post", back_populates="drafts")
    creator = relationship("User")
