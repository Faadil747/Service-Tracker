from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Optional
from app.database import get_db
from app.models import User
from app.services.auth_service import get_current_user
from app.services import ai_service

router = APIRouter(prefix="/api/ai", tags=["ai"])


class GeneratePostRequest(BaseModel):
    prompt: str
    post_type: str = "general"
    tone: str = "professional"
    hashtags: list[str] = []
    region: str = "Global"
    add_emojis: bool = True


class PredictReachRequest(BaseModel):
    content: str
    region: str = "Global"


class SentimentRequest(BaseModel):
    comment: str


@router.post("/generate-post")
async def generate_post(
    req: GeneratePostRequest,
    current_user: User = Depends(get_current_user),
):
    """Generate a LinkedIn post draft using DeepSeek (server-side only)."""
    result = await ai_service.generate_post(
        prompt=req.prompt,
        post_type=req.post_type,
        tone=req.tone,
        hashtags=req.hashtags,
        region=req.region,
        add_emojis=req.add_emojis,
    )
    return result


@router.post("/predict-reach")
async def predict_reach(
    req: PredictReachRequest,
    current_user: User = Depends(get_current_user),
):
    return await ai_service.predict_reach(req.content, req.region)


@router.post("/hashtags")
async def suggest_hashtags(
    topic: str,
    region: str = "Global",
    current_user: User = Depends(get_current_user),
):
    tags = await ai_service.suggest_hashtags(topic, region)
    return {"hashtags": tags}


@router.post("/sentiment")
async def score_sentiment(
    req: SentimentRequest,
    current_user: User = Depends(get_current_user),
):
    score = await ai_service.score_comment_sentiment(req.comment)
    label = "positive" if score > 0.2 else ("negative" if score < -0.2 else "neutral")
    return {"score": score, "label": label}


@router.get("/trending-topics")
async def trending_topics(
    region: str = "Global",
    current_user: User = Depends(get_current_user),
):
    """Stub trending topics — real implementation polls DeepSeek with seed context."""
    topics = {
        "India": ["AI in Recruitment", "Hybrid Work Culture", "Gen Z Talent", "IT Hiring Surge", "Skill-based Hiring"],
        "USA": ["Remote Work Policies", "DEI Hiring", "Tech Layoffs", "AI Ethics", "Startup Talent Wars"],
        "Indonesia": ["Startup Ecosystem", "Digital Transformation", "EV Industry Hiring", "ASEAN Expansion", "Tech Education"],
        "Global": ["AI Transformation", "Talent Shortage", "Remote First", "Future of Work", "HR Tech Innovation"],
    }
    return {"region": region, "topics": topics.get(region, topics["Global"])}
