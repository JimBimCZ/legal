import json
from typing import Any

from .db import Database, utc_now_text
from .document_chat import clean_fields, run_chat_turn
from .documents import load_catalog
from .schemas import ChatMessage, SavedDocumentDetail, SavedDocumentSummary, SendDocumentMessageResponse


class DocumentNotFoundError(Exception):
    pass


class UnknownDocumentTypeError(Exception):
    pass


def _row_to_summary(row: Any) -> SavedDocumentSummary:
    return SavedDocumentSummary(
        id=row["id"],
        documentTypeId=row["document_type_id"],
        documentTypeName=row["document_type_name"],
        createdAt=row["created_at"],
        updatedAt=row["updated_at"],
    )


def _messages_for_document(db: Database, document_id: int) -> list[ChatMessage]:
    rows = db.execute(
        "SELECT role, content FROM chat_messages WHERE document_id = ? ORDER BY id",
        (document_id,),
    ).fetchall()
    return [ChatMessage(role=row["role"], content=row["content"]) for row in rows]


def _greeting_for(document_type_name: str) -> str:
    return (
        f"Great, let's fill in your {document_type_name}. Tell me a bit about it and "
        "I'll take it from there."
    )


def list_documents_for_user(db: Database, user_id: int) -> list[SavedDocumentSummary]:
    rows = db.execute(
        "SELECT id, document_type_id, document_type_name, created_at, updated_at "
        "FROM saved_documents WHERE user_id = ? ORDER BY updated_at DESC",
        (user_id,),
    ).fetchall()
    return [_row_to_summary(row) for row in rows]


def get_document_for_user(
    db: Database, user_id: int, document_id: int
) -> SavedDocumentDetail | None:
    row = db.execute(
        "SELECT id, document_type_id, document_type_name, fields_json, created_at, updated_at "
        "FROM saved_documents WHERE id = ? AND user_id = ?",
        (document_id, user_id),
    ).fetchone()
    if row is None:
        return None
    return SavedDocumentDetail(
        id=row["id"],
        documentTypeId=row["document_type_id"],
        documentTypeName=row["document_type_name"],
        createdAt=row["created_at"],
        updatedAt=row["updated_at"],
        # Also cleaned on read, not just on write, so a document that stored
        # "not yet known"-style values before that normalization existed opens
        # as unfilled (download blocked) instead of only healing once the user
        # happens to send another chat message.
        fields=clean_fields(json.loads(row["fields_json"])),
        messages=_messages_for_document(db, row["id"]),
    )


def create_document(db: Database, user_id: int, document_type_id: str) -> SavedDocumentDetail:
    entry = next((e for e in load_catalog() if e.id == document_type_id), None)
    if entry is None:
        raise UnknownDocumentTypeError(document_type_id)

    document_id = db.insert_returning_id(
        "INSERT INTO saved_documents (user_id, document_type_id, document_type_name) "
        "VALUES (?, ?, ?)",
        (user_id, entry.id, entry.name),
    )
    db.execute(
        "INSERT INTO chat_messages (document_id, role, content) VALUES (?, 'assistant', ?)",
        (document_id, _greeting_for(entry.name)),
    )
    db.commit()

    detail = get_document_for_user(db, user_id, document_id)
    assert detail is not None  # just inserted under the same user_id
    return detail


def send_message(
    db: Database, user_id: int, document_id: int, content: str
) -> SendDocumentMessageResponse:
    row = db.execute(
        "SELECT id, document_type_id, document_type_name, fields_json "
        "FROM saved_documents WHERE id = ? AND user_id = ?",
        (document_id, user_id),
    ).fetchone()
    if row is None:
        raise DocumentNotFoundError(document_id)

    history = _messages_for_document(db, document_id)
    llm_messages = [{"role": m.role, "content": m.content} for m in history]
    llm_messages.append({"role": "user", "content": content})
    known_fields = json.loads(row["fields_json"])

    # Only reaches the DB again once the (possibly failing) LLM call has
    # succeeded, so a failed turn never persists a lone user message with no
    # reply - the caller can safely retry with the same content.
    result = run_chat_turn(llm_messages, row["document_type_id"], known_fields)

    document_type_id = result.selectedDocument or row["document_type_id"]
    document_type_name = result.selectedDocumentName or row["document_type_name"]

    db.execute(
        "INSERT INTO chat_messages (document_id, role, content) VALUES (?, 'user', ?)",
        (document_id, content),
    )
    db.execute(
        "INSERT INTO chat_messages (document_id, role, content) VALUES (?, 'assistant', ?)",
        (document_id, result.reply),
    )
    db.execute(
        "UPDATE saved_documents SET document_type_id = ?, document_type_name = ?, "
        "fields_json = ?, updated_at = ? WHERE id = ?",
        (
            document_type_id,
            document_type_name,
            json.dumps(result.fields),
            utc_now_text(),
            document_id,
        ),
    )
    db.commit()

    updated_row = db.execute(
        "SELECT updated_at FROM saved_documents WHERE id = ?", (document_id,)
    ).fetchone()

    return SendDocumentMessageResponse(
        reply=result.reply,
        selectedDocument=document_type_id,
        selectedDocumentName=document_type_name,
        fields=result.fields,
        updatedAt=updated_row["updated_at"],
    )
