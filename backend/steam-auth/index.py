"""
Steam OpenID авторизация.
GET /?action=login — редирект на Steam
GET /?action=callback&... — обработка ответа от Steam
GET /?action=me — получить текущего пользователя по сессии
POST с action=logout — выход
"""

import os
import json
import secrets
import urllib.parse
import urllib.request
import psycopg2


STEAM_OPENID_URL = "https://steamcommunity.com/openid/login"
CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Session-Id",
}


def get_db():
    return psycopg2.connect(os.environ["DATABASE_URL"])


def get_base_url(event):
    host = event.get("headers", {}).get("host", "localhost")
    proto = event.get("headers", {}).get("x-forwarded-proto", "https")
    return f"{proto}://{host}"


def steam_login_url(callback_url):
    params = {
        "openid.ns": "http://specs.openid.net/auth/2.0",
        "openid.mode": "checkid_setup",
        "openid.return_to": callback_url,
        "openid.realm": callback_url.split("?")[0].rsplit("/", 1)[0],
        "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
        "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
    }
    return STEAM_OPENID_URL + "?" + urllib.parse.urlencode(params)


def verify_steam_openid(params):
    verify_params = dict(params)
    verify_params["openid.mode"] = "check_authentication"
    data = urllib.parse.urlencode(verify_params).encode()
    req = urllib.request.Request(STEAM_OPENID_URL, data=data, method="POST")
    with urllib.request.urlopen(req, timeout=10) as resp:
        body = resp.read().decode()
    return "is_valid:true" in body


def extract_steam_id(claimed_id):
    parts = claimed_id.split("/")
    return parts[-1]


def get_steam_profile(steam_id):
    api_key = os.environ.get("STEAM_API_KEY", "")
    url = (
        f"https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/"
        f"?key={api_key}&steamids={steam_id}"
    )
    with urllib.request.urlopen(url, timeout=10) as resp:
        data = json.loads(resp.read())
    players = data.get("response", {}).get("players", [])
    return players[0] if players else {}


def upsert_user(steam_id, profile):
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO users (steam_id, username, avatar_url, profile_url, last_login)
        VALUES (%s, %s, %s, %s, NOW())
        ON CONFLICT (steam_id) DO UPDATE
          SET username = EXCLUDED.username,
              avatar_url = EXCLUDED.avatar_url,
              profile_url = EXCLUDED.profile_url,
              last_login = NOW()
        RETURNING id
        """,
        (
            steam_id,
            profile.get("personaname", "Unknown"),
            profile.get("avatarfull", ""),
            profile.get("profileurl", ""),
        ),
    )
    user_id = cur.fetchone()[0]
    conn.commit()
    cur.close()
    conn.close()
    return user_id


def create_session(user_id):
    session_id = secrets.token_hex(32)
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO sessions (id, user_id) VALUES (%s, %s)",
        (session_id, user_id),
    )
    conn.commit()
    cur.close()
    conn.close()
    return session_id


def get_user_by_session(session_id):
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT u.steam_id, u.username, u.avatar_url, u.profile_url
        FROM sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.id = %s AND s.expires_at > NOW()
        """,
        (session_id,),
    )
    row = cur.fetchone()
    cur.close()
    conn.close()
    if not row:
        return None
    return {"steam_id": row[0], "username": row[1], "avatar_url": row[2], "profile_url": row[3]}


def delete_session(session_id):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("UPDATE sessions SET expires_at = NOW() WHERE id = %s", (session_id,))
    conn.commit()
    cur.close()
    conn.close()


def handler(event: dict, context) -> dict:
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS_HEADERS, "body": ""}

    method = event.get("httpMethod", "GET")
    qs = event.get("queryStringParameters") or {}
    action = qs.get("action", "")

    base_url = get_base_url(event)
    func_path = event.get("requestContext", {}).get("path", "/api/steam-auth")

    # GET /login — redirect to Steam
    if method == "GET" and action == "login":
        callback_url = f"{base_url}{func_path}?action=callback"
        redirect_url = steam_login_url(callback_url)
        return {
            "statusCode": 302,
            "headers": {**CORS_HEADERS, "Location": redirect_url},
            "body": "",
        }

    # GET /callback — handle Steam response
    if method == "GET" and action == "callback":
        claimed_id = qs.get("openid.claimed_id", "")
        if not claimed_id:
            return {"statusCode": 400, "headers": CORS_HEADERS, "body": json.dumps({"error": "No claimed_id"})}

        if not verify_steam_openid(qs):
            return {"statusCode": 403, "headers": CORS_HEADERS, "body": json.dumps({"error": "Steam verification failed"})}

        steam_id = extract_steam_id(claimed_id)
        profile = get_steam_profile(steam_id)
        user_id = upsert_user(steam_id, profile)
        session_id = create_session(user_id)

        # Redirect to frontend with session
        frontend_url = f"{base_url}/?session={session_id}"
        return {
            "statusCode": 302,
            "headers": {**CORS_HEADERS, "Location": frontend_url},
            "body": "",
        }

    # GET /me — get current user
    if method == "GET" and action == "me":
        session_id = (event.get("headers") or {}).get("x-session-id", "")
        if not session_id:
            return {"statusCode": 401, "headers": CORS_HEADERS, "body": json.dumps({"user": None})}
        user = get_user_by_session(session_id)
        return {"statusCode": 200, "headers": CORS_HEADERS, "body": json.dumps({"user": user})}

    # POST /logout
    if method == "POST" and action == "logout":
        session_id = (event.get("headers") or {}).get("x-session-id", "")
        if session_id:
            delete_session(session_id)
        return {"statusCode": 200, "headers": CORS_HEADERS, "body": json.dumps({"ok": True})}

    return {"statusCode": 404, "headers": CORS_HEADERS, "body": json.dumps({"error": "Not found"})}
