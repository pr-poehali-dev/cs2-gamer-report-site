"""
Обработка жалоб и резолвинг Steam-профиля по ссылке.
GET /?action=resolve&url=<steam_profile_url> — получить профиль по ссылке
POST /?action=submit — подать жалобу (требует X-Session-Id)
"""

import os
import json
import re
import urllib.request
import psycopg2

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Session-Id",
}

STEAM_API_KEY = os.environ.get("STEAM_API_KEY", "")


def get_db():
    return psycopg2.connect(os.environ["DATABASE_URL"])


def get_user_by_session(session_id: str):
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT u.steam_id, u.username
        FROM sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.id = %s AND s.expires_at > NOW()
        """,
        (session_id,),
    )
    row = cur.fetchone()
    cur.close()
    conn.close()
    return {"steam_id": row[0], "username": row[1]} if row else None


def extract_steam_id_from_url(url: str) -> str | None:
    """Извлекает SteamID64 или vanity URL из ссылки на профиль."""
    # Прямой SteamID64 в URL: /profiles/76561198XXXXXXXXX
    m = re.search(r"/profiles/(\d{17})", url)
    if m:
        return m.group(1)
    # Vanity URL: /id/someusername
    m = re.search(r"/id/([^/?#]+)", url)
    if m:
        return resolve_vanity(m.group(1))
    # Просто число — уже SteamID64
    if re.fullmatch(r"\d{17}", url.strip()):
        return url.strip()
    return None


def resolve_vanity(vanity: str) -> str | None:
    url = (
        f"https://api.steampowered.com/ISteamUser/ResolveVanityURL/v0001/"
        f"?key={STEAM_API_KEY}&vanityurl={vanity}"
    )
    with urllib.request.urlopen(url, timeout=10) as resp:
        data = json.loads(resp.read())
    r = data.get("response", {})
    return r.get("steamid") if r.get("success") == 1 else None


def get_steam_profile(steam_id: str) -> dict:
    url = (
        f"https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/"
        f"?key={STEAM_API_KEY}&steamids={steam_id}"
    )
    with urllib.request.urlopen(url, timeout=10) as resp:
        data = json.loads(resp.read())
    players = data.get("response", {}).get("players", [])
    return players[0] if players else {}


def handler(event: dict, context) -> dict:
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS_HEADERS, "body": ""}

    method = event.get("httpMethod", "GET")
    qs = event.get("queryStringParameters") or {}
    action = qs.get("action", "")

    # GET /resolve?url=... — резолвим профиль по ссылке
    if method == "GET" and action == "resolve":
        profile_url = qs.get("url", "").strip()
        if not profile_url:
            return {
                "statusCode": 400,
                "headers": CORS_HEADERS,
                "body": json.dumps({"error": "url is required"}),
            }

        steam_id = extract_steam_id_from_url(profile_url)
        if not steam_id:
            return {
                "statusCode": 404,
                "headers": CORS_HEADERS,
                "body": json.dumps({"error": "Не удалось определить Steam ID по этой ссылке"}),
            }

        profile = get_steam_profile(steam_id)
        if not profile:
            return {
                "statusCode": 404,
                "headers": CORS_HEADERS,
                "body": json.dumps({"error": "Профиль Steam не найден"}),
            }

        return {
            "statusCode": 200,
            "headers": CORS_HEADERS,
            "body": json.dumps({
                "steam_id": steam_id,
                "username": profile.get("personaname", ""),
                "avatar_url": profile.get("avatarfull", ""),
                "profile_url": profile.get("profileurl", ""),
            }),
        }

    # POST /submit — подать жалобу
    if method == "POST" and action == "submit":
        session_id = (event.get("headers") or {}).get("x-session-id", "")
        if not session_id:
            return {
                "statusCode": 401,
                "headers": CORS_HEADERS,
                "body": json.dumps({"error": "Требуется авторизация через Steam"}),
            }

        reporter = get_user_by_session(session_id)
        if not reporter:
            return {
                "statusCode": 401,
                "headers": CORS_HEADERS,
                "body": json.dumps({"error": "Сессия не найдена или истекла"}),
            }

        body = json.loads(event.get("body") or "{}")
        target_steam_id = body.get("target_steam_id", "").strip()
        target_username = body.get("target_username", "").strip()
        target_avatar_url = body.get("target_avatar_url", "").strip()
        target_profile_url = body.get("target_profile_url", "").strip()
        violation_type = body.get("violation_type", "").strip()
        description = body.get("description", "").strip()
        proof_url = body.get("proof_url", "").strip()

        if not target_steam_id or not violation_type:
            return {
                "statusCode": 400,
                "headers": CORS_HEADERS,
                "body": json.dumps({"error": "Укажите профиль нарушителя и тип нарушения"}),
            }

        if reporter["steam_id"] == target_steam_id:
            return {
                "statusCode": 400,
                "headers": CORS_HEADERS,
                "body": json.dumps({"error": "Нельзя подать жалобу на самого себя"}),
            }

        conn = get_db()
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO reports
              (reporter_steam_id, reporter_username, target_steam_id, target_username,
               target_avatar_url, target_profile_url, violation_type, description, proof_url)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
            """,
            (
                reporter["steam_id"],
                reporter["username"],
                target_steam_id,
                target_username,
                target_avatar_url,
                target_profile_url,
                violation_type,
                description,
                proof_url,
            ),
        )
        report_id = cur.fetchone()[0]
        conn.commit()
        cur.close()
        conn.close()

        return {
            "statusCode": 200,
            "headers": CORS_HEADERS,
            "body": json.dumps({"ok": True, "report_id": report_id}),
        }

    return {"statusCode": 404, "headers": CORS_HEADERS, "body": json.dumps({"error": "Not found"})}
