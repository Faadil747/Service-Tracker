"""
DeepSeek AI Gateway — all calls are server-side only.
Model is configurable via settings.DEEPSEEK_MODEL (one-line swap).
When API key is absent, returns realistic stub responses for dev/test.
"""
import json
from typing import Optional
import httpx
from app.config import settings


SYSTEM_PROMPT = """You are a LinkedIn content expert for GOrecruitAI, a recruiting firm.
You write compelling, professional LinkedIn posts for HR recruitment purposes.
Always use appropriate emojis, relevant hashtags, and a tone that matches the request.
Format the post cleanly for LinkedIn."""


async def generate_post(
    prompt: str,
    post_type: str = "general",
    tone: str = "professional",
    hashtags: Optional[list[str]] = None,
    region: str = "Global",
    add_emojis: bool = True,
) -> dict:
    """Generate a LinkedIn post draft using DeepSeek."""

    if not settings.DEEPSEEK_API_KEY:
        return _stub_post(prompt, post_type, tone, hashtags, region)

    hashtag_str = " ".join(f"#{h}" for h in (hashtags or [])) if hashtags else ""
    user_msg = f"""Write a LinkedIn post with these requirements:
- Type: {post_type}
- Tone: {tone}
- Region focus: {region}
- {'Include emojis' if add_emojis else 'No emojis'}
- Hashtags to include: {hashtag_str or 'choose appropriate ones'}
- Topic/Prompt: {prompt}

Provide:
1. The post content (ready to publish)
2. A list of 5 recommended hashtags
3. Best posting time recommendation for {region}
4. Predicted engagement score (1-100)
"""

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
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_msg},
                ],
                "temperature": 0.8,
                "max_tokens": 1000,
            },
        )
        resp.raise_for_status()
        data = resp.json()
        content = data["choices"][0]["message"]["content"]
        return {"content": content, "source": "deepseek", "model": settings.DEEPSEEK_MODEL}


async def predict_reach(content: str, region: str = "Global") -> dict:
    """Predict post reach before publishing (stub-friendly)."""
    if not settings.DEEPSEEK_API_KEY:
        return {"predicted_reach": 1250, "confidence": 72, "tips": ["Post between 9-11 AM", "Add more hashtags"]}

    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.post(
            f"{settings.DEEPSEEK_BASE_URL}/v1/chat/completions",
            headers={"Authorization": f"Bearer {settings.DEEPSEEK_API_KEY}", "Content-Type": "application/json"},
            json={
                "model": settings.DEEPSEEK_MODEL,
                "messages": [
                    {"role": "system", "content": "You are a LinkedIn analytics expert. Return JSON only."},
                    {"role": "user", "content": f"Analyze this LinkedIn post for {region} audience and predict reach. Return JSON: {{predicted_reach: number, confidence: 0-100, tips: [string]}}.\n\nPost:\n{content}"},
                ],
                "temperature": 0.3,
                "max_tokens": 200,
            },
        )
        resp.raise_for_status()
        raw = resp.json()["choices"][0]["message"]["content"]
        try:
            return json.loads(raw)
        except Exception:
            return {"predicted_reach": 800, "confidence": 60, "tips": []}


async def suggest_hashtags(topic: str, region: str = "Global") -> list[str]:
    """Return ranked hashtag recommendations."""
    if not settings.DEEPSEEK_API_KEY:
        return ["#Hiring", "#RecruitmentTips", "#LinkedInJobs", "#HRTech", "#GOrecruitAI"]

    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.post(
            f"{settings.DEEPSEEK_BASE_URL}/v1/chat/completions",
            headers={"Authorization": f"Bearer {settings.DEEPSEEK_API_KEY}", "Content-Type": "application/json"},
            json={
                "model": settings.DEEPSEEK_MODEL,
                "messages": [
                    {"role": "system", "content": "Return a JSON array of 10 LinkedIn hashtags only, no explanation."},
                    {"role": "user", "content": f"Top LinkedIn hashtags for topic: {topic}, region: {region}"},
                ],
                "temperature": 0.5,
                "max_tokens": 150,
            },
        )
        resp.raise_for_status()
        raw = resp.json()["choices"][0]["message"]["content"]
        try:
            return json.loads(raw)
        except Exception:
            return ["#Hiring", "#Jobs", "#Recruitment"]


async def score_comment_sentiment(comment: str) -> float:
    """Return sentiment score -1.0 (negative) to 1.0 (positive)."""
    if not settings.DEEPSEEK_API_KEY:
        return 0.7
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            f"{settings.DEEPSEEK_BASE_URL}/v1/chat/completions",
            headers={"Authorization": f"Bearer {settings.DEEPSEEK_API_KEY}", "Content-Type": "application/json"},
            json={
                "model": settings.DEEPSEEK_MODEL,
                "messages": [
                    {"role": "system", "content": "Return only a float between -1.0 and 1.0 representing sentiment."},
                    {"role": "user", "content": comment},
                ],
                "temperature": 0.1,
                "max_tokens": 10,
            },
        )
        resp.raise_for_status()
        raw = resp.json()["choices"][0]["message"]["content"].strip()
        try:
            return float(raw)
        except Exception:
            return 0.0


def _stub_post(prompt: str, post_type: str, tone: str, hashtags, region: str) -> dict:
    """Realistic mock response for dev/test when no API key is configured."""
    region_cta = {"India": "🇮🇳 Bangalore/Mumbai/Delhi", "USA": "🇺🇸 Remote/Hybrid available", "Indonesia": "🇮🇩 Jakarta/Bali"}.get(region, "")
    content = f"""🚀 Exciting opportunity alert! {region_cta}

We're looking for **talented individuals** to join the GOrecruitAI family.

{prompt}

At GOrecruitAI, we believe in:
✅ Continuous learning & growth
✅ Collaborative & inclusive culture  
✅ Cutting-edge AI-powered recruiting

Ready to take the next step in your career?

📩 DM us or apply via the link below!

#Hiring #Jobs #Recruitment #GOrecruitAI #CareerOpportunity #LinkedInJobs #HRTech #AIRecruitment"""
    return {
        "content": content,
        "hashtags": ["Hiring", "Jobs", "Recruitment", "GOrecruitAI", "HRTech"],
        "best_time": "Tuesday–Thursday, 9–11 AM local time",
        "predicted_engagement": 74,
        "source": "stub",
    }
