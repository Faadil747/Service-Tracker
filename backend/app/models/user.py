import enum
import uuid
from datetime import datetime
from sqlalchemy import String, Enum as SAEnum, Boolean, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class UserRole(str, enum.Enum):
    developer = "developer"
    agent = "agent"
    admin = "admin"


class UserRegion(str, enum.Enum):
    india = "India"
    usa = "USA"
    indonesia = "Indonesia"
    global_ = "Global"


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(SAEnum(UserRole), default=UserRole.agent)
    region: Mapped[str] = mapped_column(String(50), default="Global")
    linkedin_url: Mapped[str] = mapped_column(String(500), default="")
    avatar_url: Mapped[str] = mapped_column(String(500), default="")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    tasks_created = relationship("Task", foreign_keys="Task.created_by_id", back_populates="creator")
    tasks_assigned = relationship("TaskAssignment", back_populates="agent")
    notifications = relationship("Notification", back_populates="user")
    alerts_raised = relationship("Alert", foreign_keys="Alert.raised_by_id", back_populates="raised_by_user")
    activity_logs = relationship("ActivityLog", back_populates="user")
    comments = relationship("Comment", back_populates="author")
    posts = relationship("Post", foreign_keys="Post.created_by_id", back_populates="creator")
