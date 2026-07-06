import uuid
from datetime import datetime
from sqlalchemy import String, Boolean, DateTime, ForeignKey, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Alert(Base):
    __tablename__ = "alerts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    raised_by_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str] = mapped_column(Text, default="")
    priority: Mapped[str] = mapped_column(String(20), default="high")  # high/critical
    status: Mapped[str] = mapped_column(String(20), default="open")  # open/resolved
    region: Mapped[str] = mapped_column(String(50), default="Global")
    reference_id: Mapped[str] = mapped_column(String(36), default="")
    reference_type: Mapped[str] = mapped_column(String(50), default="")
    resolved_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    resolved_by_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    raised_by_user = relationship("User", foreign_keys=[raised_by_id], back_populates="alerts_raised")
    resolved_by_user = relationship("User", foreign_keys=[resolved_by_id])
