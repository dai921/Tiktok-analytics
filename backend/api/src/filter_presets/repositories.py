# backend/api/src/filter_presets/repositories.py
import json
from typing import Any, Dict, List, Optional
from src.db.database import execute_query, fetch_one, execute_update
from src.auth.utils import generate_uuid

def _parse_payload(row: Dict[str, Any]) -> Dict[str, Any]:
    if not row:
        return row
    payload = row.get("payload")
    if isinstance(payload, str):
        try:
            row["payload"] = json.loads(payload)
        except Exception:
            row["payload"] = {}
    return row

def list_presets(user_number: int, context_key: Optional[str] = None) -> List[Dict[str, Any]]:
    params: Dict[str, Any] = {"user_number": user_number}
    where = "user_number = :user_number AND deleted_at IS NULL"
    if context_key:
        where += " AND context_key = :context_key"
        params["context_key"] = context_key
    rows = execute_query(f"""
        SELECT id, preset_id, user_number, name, context_key, payload, schema_version, is_default, created_at, updated_at
        FROM filter_presets
        WHERE {where}
        ORDER BY updated_at DESC
    """, params)
    return [_parse_payload(r) for r in rows]

def get_preset(user_number: int, preset_id: str) -> Optional[Dict[str, Any]]:
    row = fetch_one("""
        SELECT id, preset_id, user_number, name, context_key, payload, schema_version, is_default, created_at, updated_at
        FROM filter_presets
        WHERE preset_id = :preset_id AND user_number = :user_number AND deleted_at IS NULL
        LIMIT 1
    """, {"preset_id": preset_id, "user_number": user_number})
    return _parse_payload(row) if row else None

def get_default_preset(user_number: int, context_key: str) -> Optional[Dict[str, Any]]:
    row = fetch_one("""
        SELECT id, preset_id, user_number, name, context_key, payload, schema_version, is_default, created_at, updated_at
        FROM filter_presets
        WHERE user_number = :user_number AND context_key = :context_key AND is_default = 1 AND deleted_at IS NULL
        LIMIT 1
    """, {"user_number": user_number, "context_key": context_key})
    return _parse_payload(row) if row else None

def insert_preset(user_number: int, data: Dict[str, Any]) -> Dict[str, Any]:
    preset_id = generate_uuid()
    payload_str = json.dumps(data["payload"], ensure_ascii=False)
    # デフォルトにする場合、同一ユーザー×コンテキストで既存デフォルトを解除
    if data.get("is_default", False):
        execute_update("""
            UPDATE filter_presets
            SET is_default = 0, updated_at = NOW()
            WHERE user_number = :user_number AND context_key = :context_key AND deleted_at IS NULL
        """, {"user_number": user_number, "context_key": data["context_key"]})
    execute_update("""
        INSERT INTO filter_presets
            (preset_id, user_number, name, context_key, payload, schema_version, is_default, created_at, updated_at)
        VALUES
            (:preset_id, :user_number, :name, :context_key, :payload, :schema_version, :is_default, NOW(), NOW())
    """, {
        "preset_id": preset_id,
        "user_number": user_number,
        "name": data["name"],
        "context_key": data["context_key"],
        "payload": payload_str,
        "schema_version": int(data.get("schema_version", 1)),
        "is_default": 1 if data.get("is_default", False) else 0
    })
    return get_preset(user_number, preset_id)  # type: ignore

def update_preset(user_number: int, preset_id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    current = get_preset(user_number, preset_id)
    if not current:
        return None

    # デフォルト変更対応のため、変更後に用いるcontext_keyを決定
    new_context = data.get("context_key", current["context_key"])

    # is_default 指定ありで True の場合は他を落とす
    if data.get("is_default") is True:
        execute_update("""
            UPDATE filter_presets
            SET is_default = 0, updated_at = NOW()
            WHERE user_number = :user_number AND context_key = :context_key AND deleted_at IS NULL
        """, {"user_number": user_number, "context_key": new_context})

    sets = []
    params: Dict[str, Any] = {"preset_id": preset_id, "user_number": user_number}

    if "name" in data and data["name"] is not None:
        sets.append("name = :name")
        params["name"] = data["name"]
    if "context_key" in data and data["context_key"] is not None:
        sets.append("context_key = :context_key")
        params["context_key"] = data["context_key"]
    if "payload" in data and data["payload"] is not None:
        sets.append("payload = :payload")
        params["payload"] = json.dumps(data["payload"], ensure_ascii=False)
    if "schema_version" in data and data["schema_version"] is not None:
        sets.append("schema_version = :schema_version")
        params["schema_version"] = int(data["schema_version"])
    if "is_default" in data and data["is_default"] is not None:
        sets.append("is_default = :is_default")
        params["is_default"] = 1 if data["is_default"] else 0

    if not sets:
        return current

    sets.append("updated_at = NOW()")
    sql = f"""
        UPDATE filter_presets
        SET {", ".join(sets)}
        WHERE preset_id = :preset_id AND user_number = :user_number AND deleted_at IS NULL
    """
    execute_update(sql, params)
    return get_preset(user_number, preset_id)

def set_default(user_number: int, preset_id: str) -> Optional[Dict[str, Any]]:
    row = get_preset(user_number, preset_id)
    if not row:
        return None
    context_key = row["context_key"]
    execute_update("""
        UPDATE filter_presets
        SET is_default = 0, updated_at = NOW()
        WHERE user_number = :user_number AND context_key = :context_key AND deleted_at IS NULL
    """, {"user_number": user_number, "context_key": context_key})
    execute_update("""
        UPDATE filter_presets
        SET is_default = 1, updated_at = NOW()
        WHERE preset_id = :preset_id AND user_number = :user_number AND deleted_at IS NULL
    """, {"preset_id": preset_id, "user_number": user_number})
    return get_preset(user_number, preset_id)

def soft_delete(user_number: int, preset_id: str) -> bool:
    # デフォルトであっても削除時は is_default = 0 にする
    execute_update("""
        UPDATE filter_presets
        SET deleted_at = NOW(), is_default = 0, updated_at = NOW()
        WHERE preset_id = :preset_id AND user_number = :user_number AND deleted_at IS NULL
    """, {"preset_id": preset_id, "user_number": user_number})
    # 1行影響を厳密に知るAPIがないため存在確認で代替
    remained = get_preset(user_number, preset_id)
    return remained is None