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
    provider: Optional[str] = "deepseek",
    current_user: User = Depends(get_current_user),
):
    """Generate a LinkedIn post draft using DeepSeek or OpenRouter (server-side only)."""
    result = await ai_service.generate_post(
        prompt=req.prompt,
        post_type=req.post_type,
        tone=req.tone,
        hashtags=req.hashtags,
        region=req.region,
        add_emojis=req.add_emojis,
        provider=provider,
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
    """Return trending LinkedIn topics for the region. Uses DeepSeek when available."""
    from app.config import settings

    static_fallback = {
        "India": ["AI in Recruitment", "Hybrid Work Culture", "Gen Z Talent", "IT Hiring Surge", "Skill-based Hiring"],
        "USA": ["Remote Work Policies", "DEI Hiring", "Tech Layoffs", "AI Ethics", "Startup Talent Wars"],
        "Indonesia": ["Startup Ecosystem", "Digital Transformation", "EV Industry Hiring", "ASEAN Expansion", "Tech Education"],
        "Global": ["AI Transformation", "Talent Shortage", "Remote First", "Future of Work", "HR Tech Innovation"],
    }

    if not settings.DEEPSEEK_API_KEY:
        return {"region": region, "topics": static_fallback.get(region, static_fallback["Global"]), "source": "static"}

    import httpx, json
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(
                f"{settings.DEEPSEEK_BASE_URL}/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.DEEPSEEK_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": settings.DEEPSEEK_MODEL,
                    "messages": [
                        {
                            "role": "system",
                            "content": (
                                "You are a LinkedIn content strategist specialising in HR and recruitment. "
                                "Return a JSON array of exactly 5 trending LinkedIn topic strings for the given region. "
                                "Return ONLY the JSON array, no explanation."
                            ),
                        },
                        {
                            "role": "user",
                            "content": (
                                f"What are the top 5 trending LinkedIn topics right now in {region} "
                                "for HR professionals, recruiters, and talent acquisition teams? "
                                "Return only a JSON array of 5 short topic strings."
                            ),
                        },
                    ],
                    "temperature": 0.7,
                    "max_tokens": 150,
                },
            )
            resp.raise_for_status()
            raw = resp.json()["choices"][0]["message"]["content"].strip()
            # Strip markdown code fences if present
            if raw.startswith("```"):
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
            topics = json.loads(raw)
            if isinstance(topics, list) and len(topics) > 0:
                return {"region": region, "topics": topics[:5], "source": "deepseek"}
    except Exception as e:
        print(f"DeepSeek trending topics error: {e}")

    return {"region": region, "topics": static_fallback.get(region, static_fallback["Global"]), "source": "static"}


@router.post("/improve-post")
async def improve_post(
    content: str,
    goal: str = "engagement",
    provider: Optional[str] = "deepseek",
    current_user: User = Depends(get_current_user),
):
    """Use DeepSeek or OpenRouter to improve an existing LinkedIn post draft."""
    from app.config import settings
    
    if provider == "openrouter/free":
        if not settings.OPENROUTER_API_KEY:
            return {"content": content, "source": "unchanged", "message": "OpenRouter not configured"}
        import httpx, json
        print("[AI Router] Routing enhance request to OpenRouter (Llama 3.3)...")
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    f"{settings.OPENROUTER_BASE_URL}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
                        "Content-Type": "application/json",
                        "HTTP-Referer": "http://localhost:8000",
                        "X-Title": "LinkedIn Tracker Dual-Model Dev Branch",
                    },
                    json={
                        "model": settings.OPENROUTER_MODEL_ID,
                        "messages": [
                            {
                                "role": "system",
                                "content": (
                                    "You are a LinkedIn content expert for GOrecruitAI. "
                                    f"Improve the given LinkedIn post to maximise {goal}. "
                                    "Keep the core message but enhance structure, emojis, and CTAs. "
                                    "You must return your response as a JSON object with a single key 'content' containing the improved post text."
                                ),
                            },
                            {"role": "user", "content": content},
                        ],
                        "temperature": 0.1,
                        "max_tokens": 800,
                        "response_format": {"type": "json_object"},
                    },
                )
                resp.raise_for_status()
                raw_content = resp.json()["choices"][0]["message"]["content"]
                try:
                    parsed = json.loads(raw_content)
                    improved = parsed.get("content", raw_content) if isinstance(parsed, dict) else raw_content
                except Exception:
                    improved = raw_content
                improved = ai_service._clean_post(improved)
                return {"content": improved, "source": "openrouter"}
        except Exception as e:
            return {"content": content, "source": "unchanged", "error": str(e)}

    # Default to DeepSeek logic
    if not settings.DEEPSEEK_API_KEY:
        return {"content": content, "source": "unchanged", "message": "DeepSeek not configured"}

    import httpx
    print("[AI Router] Routing enhance request to DeepSeek...")
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{settings.DEEPSEEK_BASE_URL}/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.DEEPSEEK_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": settings.DEEPSEEK_MODEL,
                    "messages": [
                        {
                            "role": "system",
                            "content": (
                                "You are a LinkedIn content expert for GOrecruitAI. "
                                f"Improve the given LinkedIn post to maximise {goal}. "
                                "Keep the core message but enhance structure, emojis, and CTAs. "
                                "Return only the improved post text."
                            ),
                        },
                        {"role": "user", "content": content},
                    ],
                    "temperature": 0.7,
                    "max_tokens": 800,
                },
            )
            resp.raise_for_status()
            improved = ai_service._clean_post(resp.json()["choices"][0]["message"]["content"])
            return {"content": improved, "source": "deepseek"}
    except Exception as e:
        return {"content": content, "source": "unchanged", "error": str(e)}
