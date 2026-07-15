"""
DeepSeek AI Gateway — all calls are server-side only.
Model is configurable via settings.DEEPSEEK_MODEL (one-line swap).
When API key is absent, returns realistic stub responses for dev/test.
"""
import json
import re
from typing import Optional
import httpx
from app.config import settings


SYSTEM_PROMPT = """You are a dedicated social media manager and team member managing the LinkedIn page for GOrecruitAI, a recruitment company.

Write ONE ready-to-publish LinkedIn post. Follow these rules strictly:
- Speak from the perspective of a team member (e.g., use "we", "our team", "us") representing GOrecruitAI.
- Tone should be collaborative, engaging, professional, and authentic—like a human social media manager.
- Use clear, professional English with correct spelling and grammar. Proofread before you answer.
- Output PLAIN text only. Do NOT use any markdown (no **bold**, *italics*, __underline__, backticks, or "#" headings) and do NOT use decorative Unicode fonts (no 𝐛𝐨𝐥𝐝 or 𝘪𝘵𝘢𝘭𝘪𝘤 look-alike characters). Use standard letters only so it renders identically everywhere.
- Structure it for LinkedIn: a strong one-line hook, then short scannable paragraphs (1-2 sentences) separated by blank lines. Use "• " for any bullet points.
- Use a few tasteful, relevant emojis — not one on every line.
- Include a clear call to action.
- End with 3-6 relevant hashtags on the final line, each starting with "#".
- Return ONLY the finished post text. No labels, no preamble, no "Here is your post", no explanations."""


from fastapi import HTTPException

async def generate_post(
    prompt: str,
    post_type: str = "general",
    tone: str = "professional",
    hashtags: Optional[list[str]] = None,
    region: str = "Global",
    add_emojis: bool = True,
    provider: str = "deepseek",
) -> dict:
    """Generate a LinkedIn post draft using DeepSeek or OpenRouter."""
    if provider == "openrouter/free":
        if not settings.OPENROUTER_API_KEY:
            return _stub_post(prompt, post_type, tone, hashtags, region)

        hashtag_str = " ".join(f"#{h.lstrip('#')}" for h in (hashtags or [])) if hashtags else ""
        user_msg = f"""Write one LinkedIn post.

Topic: {prompt}
Post type: {post_type.replace('_', ' ')}
Tone: {tone}
Region focus: {region}
Emojis: {'yes, a few tasteful ones' if add_emojis else 'none'}
Hashtags to include: {hashtag_str or 'choose 3-6 relevant ones'}

Return only the finished post text, ready to paste into LinkedIn."""

        # Define a list of high-quality free models to try in sequence if rate-limited
        models_to_try = [
            settings.OPENROUTER_MODEL_ID,
            "qwen/qwen-2.5-72b-instruct:free",
            "google/gemma-2-9b-it:free",
            "meta-llama/llama-3-8b-instruct:free",
            "openrouter/free"
        ]
        
        # Deduplicate while preserving order
        seen = set()
        models_to_try = [m for m in models_to_try if m and not (m in seen or seen.add(m))]

        last_error = None
        for model in models_to_try:
            print(f"[AI Service] Routing generation request to OpenRouter ({model})...")
            try:
                json_payload = {
                    "model": model,
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT + "\n\nYou must return your response as a JSON object with a single key 'content' containing the post."},
                        {"role": "user", "content": user_msg},
                    ],
                    "temperature": 0.1,
                    "max_tokens": 1000,
                }
                
                # Check if model typically supports JSON mode parameter (large or auto-routing endpoints)
                supports_json = "llama-3.3" in model or "qwen-2.5-72b" in model or "openrouter/free" in model
                if supports_json:
                    json_payload["response_format"] = {"type": "json_object"}

                async with httpx.AsyncClient(timeout=30.0) as client:
                    resp = await client.post(
                        f"{settings.OPENROUTER_BASE_URL}/chat/completions",
                        headers={
                            "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
                            "Content-Type": "application/json",
                            "HTTP-Referer": "http://localhost:8000",
                            "X-Title": "LinkedIn Tracker Dual-Model Dev Branch",
                        },
                        json=json_payload,
                    )
                    
                    # If JSON format caused a 400 Bad Request (not supported by model), retry without it
                    if resp.status_code == 400 and "response_format" in json_payload:
                        print(f"[AI Service] Model {model} rejected JSON format. Retrying without JSON format...")
                        del json_payload["response_format"]
                        resp = await client.post(
                            f"{settings.OPENROUTER_BASE_URL}/chat/completions",
                            headers={
                                "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
                                "Content-Type": "application/json",
                                "HTTP-Referer": "http://localhost:8000",
                                "X-Title": "LinkedIn Tracker Dual-Model Dev Branch",
                            },
                            json=json_payload,
                        )

                    resp.raise_for_status()
                    raw_content = resp.json()["choices"][0]["message"]["content"]
                    try:
                        parsed = json.loads(raw_content)
                        content = parsed.get("content", raw_content) if isinstance(parsed, dict) else raw_content
                    except Exception:
                        content = raw_content
                    content = _clean_post(content)
                    return {"content": content, "source": "openrouter", "model": model}
            except httpx.HTTPStatusError as e:
                last_error = e
                status_code = e.response.status_code
                response_text = e.response.text
                print(f"[AI Service] Model {model} failed with status {status_code}: {response_text}. Trying next fallback model...")
                continue
            except Exception as e:
                last_error = e
                print(f"[AI Service] Model {model} encountered error: {str(e)}. Trying next fallback model...")
                continue

        # If we got here, all models in the fallback chain failed
        if last_error and isinstance(last_error, httpx.HTTPStatusError) and last_error.response.status_code == 429:
            raise HTTPException(
                status_code=429,
                detail="OpenRouter free models are currently heavily rate-limited (Too Many Requests). Please try again in a few seconds or switch to DeepSeek."
            )
        
        detail_msg = f"Failed to generate post via OpenRouter fallback chain. Last error: {str(last_error)}"
        if last_error and isinstance(last_error, httpx.HTTPStatusError):
            detail_msg = f"OpenRouter API error: {last_error.response.text}"
            
        raise HTTPException(
            status_code=502,
            detail=detail_msg
        )

    # Default to DeepSeek logic
    if not settings.DEEPSEEK_API_KEY:
        return _stub_post(prompt, post_type, tone, hashtags, region)

    hashtag_str = " ".join(f"#{h.lstrip('#')}" for h in (hashtags or [])) if hashtags else ""
    user_msg = f"""Write one LinkedIn post.

Topic: {prompt}
Post type: {post_type.replace('_', ' ')}
Tone: {tone}
Region focus: {region}
Emojis: {'yes, a few tasteful ones' if add_emojis else 'none'}
Hashtags to include: {hashtag_str or 'choose 3-6 relevant ones'}

Return only the finished post text, ready to paste into LinkedIn."""

    print("[AI Service] Routing generation request to DeepSeek...")
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
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": user_msg},
                    ],
                    "temperature": 0.8,
                    "max_tokens": 1000,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            content = _clean_post(data["choices"][0]["message"]["content"])
            return {"content": content, "source": "deepseek", "model": settings.DEEPSEEK_MODEL}
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 429:
            raise HTTPException(
                status_code=429,
                detail="DeepSeek API is currently rate-limited. Please try again in a few seconds."
            )
        raise HTTPException(
            status_code=e.response.status_code,
            detail=f"DeepSeek API error: {e.response.text}"
        )
    except Exception as e:
        if isinstance(e, HTTPException):
            raise
        raise HTTPException(
            status_code=502,
            detail=f"Failed to connect to DeepSeek: {str(e)}"
        )


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


def _clean_post(text: str) -> str:
    """Normalise model output into clean, LinkedIn-ready plain text.

    Strips markdown artifacts (**bold**, *italics*, `code`, "#" headings, code
    fences) and decorative wrappers that render as literal symbols or mismatched
    fonts on LinkedIn, while preserving real #hashtags and emojis.
    """
    if not text:
        return ""
    t = text.strip()
    # Strip surrounding code fences
    if t.startswith("```"):
        t = re.sub(r"^```[a-zA-Z]*\n?", "", t)
        t = re.sub(r"\n?```$", "", t).strip()
    # Drop a leading label the model sometimes adds ("Here is your post:", "Post:")
    t = re.sub(r"^(?:here(?:'|’)?s|here is)\s+(?:your |the )?(?:linkedin )?post\s*[:\-]?\s*", "", t, flags=re.IGNORECASE).strip()
    t = re.sub(r"^(?:linkedin\s+)?post\s*[:\-]\s+", "", t, flags=re.IGNORECASE).strip()
    # Remove markdown emphasis markers but keep the words
    t = re.sub(r"\*\*(.+?)\*\*", r"\1", t)
    t = re.sub(r"__(.+?)__", r"\1", t)
    t = re.sub(r"(?<!\w)\*(?!\s)(.+?)(?<!\s)\*(?!\w)", r"\1", t)
    t = re.sub(r"`([^`]+)`", r"\1", t)
    # Markdown headings ("## Heading") -> plain text; real #hashtags (no space) are kept
    t = re.sub(r"(?m)^\s{0,3}#{1,6}\s+", "", t)
    # Normalise "- " / "* " bullets to "• "
    t = re.sub(r"(?m)^\s*[-*]\s+", "• ", t)
    # Collapse 3+ blank lines to a single blank line and trim trailing spaces
    t = re.sub(r"\n{3,}", "\n\n", t)
    t = "\n".join(line.rstrip() for line in t.splitlines())
    return t.strip()


def _stub_post(prompt: str, post_type: str, tone: str, hashtags, region: str) -> dict:
    """Realistic mock response for dev/test when no API key is configured.

    Written as clean plain text (no markdown) so it renders identically on LinkedIn.
    """
    region_line = {
        "India": "📍 Roles across Bangalore, Mumbai and Delhi",
        "USA": "📍 Remote and hybrid roles across the US",
        "Indonesia": "📍 Roles in Jakarta and beyond",
    }.get(region, "")
    tags = [h.lstrip("#") for h in (hashtags or [])] or ["Hiring", "Jobs", "Recruitment", "GOrecruitAI", "HRTech"]
    tag_line = " ".join(f"#{h}" for h in tags)
    content = _clean_post(f"""🚀 We're growing, and we're looking for great people to join us!

{prompt.strip()}

At GOrecruitAI, you'll find:
• A culture built on learning and growth
• A collaborative, inclusive team
• The chance to work on AI-powered recruiting
{(chr(10) + region_line) if region_line else ""}

Interested, or know someone who would be a great fit? Send us a message or apply via the link below. 👇

{tag_line}""")
    return {
        "content": content,
        "hashtags": tags[:5],
        "best_time": "Tuesday to Thursday, 9-11 AM local time",
        "predicted_engagement": 74,
        "source": "stub",
    }
