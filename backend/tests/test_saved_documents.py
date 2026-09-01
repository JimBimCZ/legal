import json

import pytest


class FakeMessage:
    def __init__(self, content: str) -> None:
        self.content = content


class FakeChoice:
    def __init__(self, content: str) -> None:
        self.message = FakeMessage(content)


class FakeResponse:
    def __init__(self, content: str) -> None:
        self.choices = [FakeChoice(content)]


class RecordedCalls(list):
    def __init__(self) -> None:
        super().__init__()
        self.queue: list[dict] = []


@pytest.fixture()
def mock_completion(monkeypatch):
    calls = RecordedCalls()

    def fake_completion(**kwargs):
        calls.append(kwargs)
        return FakeResponse(json.dumps(calls.queue.pop(0)))

    monkeypatch.setattr("app.document_chat.completion", fake_completion)
    return calls


def test_create_saved_document_seeds_a_greeting(authed_client):
    response = authed_client.post("/api/saved-documents", json={"documentTypeId": "Mutual-NDA.md"})
    assert response.status_code == 201
    body = response.json()
    assert body["documentTypeId"] == "Mutual-NDA.md"
    assert body["documentTypeName"] == "Mutual Non-Disclosure Agreement"
    assert body["fields"] == {}
    assert len(body["messages"]) == 1
    assert body["messages"][0]["role"] == "assistant"
    assert "Mutual Non-Disclosure Agreement" in body["messages"][0]["content"]


def test_create_saved_document_rejects_unknown_document_type(authed_client):
    response = authed_client.post("/api/saved-documents", json={"documentTypeId": "Nonexistent.md"})
    assert response.status_code == 400


def _as_other_user(client, github_id, email):
    """Temporarily swap the client's session for a second user, run the given
    actions, then restore the original. A second TestClient(app) can't be used
    for this: entering it re-triggers the app's lifespan and wipes the shared
    test database."""
    from tests.conftest import sign_in_as

    saved_cookies = dict(client.cookies)
    client.cookies.clear()
    sign_in_as(client, github_id=github_id, login=f"user{github_id}", email=email)
    try:
        yield client
    finally:
        client.cookies.clear()
        for name, value in saved_cookies.items():
            client.cookies.set(name, value)


def test_list_saved_documents_returns_only_the_current_users_documents(authed_client):
    authed_client.post("/api/saved-documents", json={"documentTypeId": "Mutual-NDA.md"})

    for other in _as_other_user(authed_client, 2, "otheruser@example.com"):
        other.post("/api/saved-documents", json={"documentTypeId": "CSA.md"})

    response = authed_client.get("/api/saved-documents")
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["documentTypeId"] == "Mutual-NDA.md"


def test_get_saved_document_not_owned_by_caller_returns_404(authed_client):
    created = None
    for other in _as_other_user(authed_client, 3, "otheruser2@example.com"):
        created = other.post("/api/saved-documents", json={"documentTypeId": "CSA.md"}).json()

    response = authed_client.get(f"/api/saved-documents/{created['id']}")
    assert response.status_code == 404


def test_get_nonexistent_saved_document_returns_404(authed_client):
    response = authed_client.get("/api/saved-documents/999999")
    assert response.status_code == 404


def test_send_message_persists_history_and_fields(authed_client, mock_completion):
    created = authed_client.post(
        "/api/saved-documents", json={"documentTypeId": "CSA.md"}
    ).json()

    mock_completion.queue.append(
        {
            "reply": "Got it, who's the provider?",
            "selectedDocument": "Cloud Service Agreement",
            "fields": {"customer": "Acme Inc."},
        }
    )
    response = authed_client.post(
        f"/api/saved-documents/{created['id']}/messages",
        json={"content": "The customer is Acme Inc."},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["reply"] == "Got it, who's the provider?"
    assert body["selectedDocument"] == "CSA.md"
    assert body["fields"]["customer"] == "Acme Inc."

    detail = authed_client.get(f"/api/saved-documents/{created['id']}").json()
    assert detail["fields"]["customer"] == "Acme Inc."
    assert [m["role"] for m in detail["messages"]] == ["assistant", "user", "assistant"]
    assert detail["messages"][1]["content"] == "The customer is Acme Inc."
    assert detail["messages"][2]["content"] == "Got it, who's the provider?"


def test_send_message_carries_forward_persisted_history_to_the_next_turn(authed_client, mock_completion):
    created = authed_client.post(
        "/api/saved-documents", json={"documentTypeId": "CSA.md"}
    ).json()

    mock_completion.queue.append(
        {"reply": "Noted.", "selectedDocument": "Cloud Service Agreement", "fields": {"customer": "Acme Inc."}}
    )
    authed_client.post(
        f"/api/saved-documents/{created['id']}/messages", json={"content": "The customer is Acme Inc."}
    )

    mock_completion.queue.append(
        {
            "reply": "Great, thanks.",
            "selectedDocument": "Cloud Service Agreement",
            "fields": {"customer": "Acme Inc.", "provider": "Globex"},
        }
    )
    authed_client.post(
        f"/api/saved-documents/{created['id']}/messages", json={"content": "The provider is Globex."}
    )

    second_call_messages = mock_completion[1]["messages"]
    # System prompt + 3 persisted turns (greeting, first user msg, first reply) + the new user msg.
    assert len(second_call_messages) == 5
    assert "Acme Inc." in second_call_messages[0]["content"]


def test_send_message_to_unowned_document_returns_404(authed_client, mock_completion):
    created = None
    for other in _as_other_user(authed_client, 4, "otheruser3@example.com"):
        created = other.post("/api/saved-documents", json={"documentTypeId": "CSA.md"}).json()

    response = authed_client.post(
        f"/api/saved-documents/{created['id']}/messages", json={"content": "Hello"}
    )
    assert response.status_code == 404


def test_send_message_does_not_persist_a_failed_turn(authed_client, monkeypatch):
    created = authed_client.post(
        "/api/saved-documents", json={"documentTypeId": "CSA.md"}
    ).json()

    def failing_completion(**kwargs):
        raise RuntimeError("upstream is down")

    monkeypatch.setattr("app.document_chat.completion", failing_completion)

    response = authed_client.post(
        f"/api/saved-documents/{created['id']}/messages", json={"content": "Hello"}
    )
    assert response.status_code == 502

    detail = authed_client.get(f"/api/saved-documents/{created['id']}").json()
    # Only the seeded greeting remains - the failed turn's user message was never written.
    assert len(detail["messages"]) == 1


def test_saved_documents_require_authentication(client):
    assert client.get("/api/saved-documents").status_code == 401
    assert client.post("/api/saved-documents", json={"documentTypeId": "CSA.md"}).status_code == 401


def test_stand_in_field_values_stored_earlier_open_as_unfilled(authed_client):
    """Documents saved before stand-in values were normalized away must not
    still present as complete (and therefore downloadable) when reopened."""
    # Seeded through the app's own connection rather than a raw sqlite3 one,
    # so this test exercises whichever backend the suite is running against.
    from app.db import get_connection

    created = authed_client.post(
        "/api/saved-documents", json={"documentTypeId": "Mutual-NDA.md"}
    ).json()

    # The generator itself is held, not just the connection it yields - letting
    # it fall out of scope would run its finally block and close the database.
    connection = get_connection()
    db = next(connection)
    try:
        db.execute(
            "UPDATE saved_documents SET fields_json = ? WHERE id = ?",
            (
                '{"party1Name": "(currently: not yet known)", "party2Name": "Acme Inc."}',
                created["id"],
            ),
        )
        db.commit()
    finally:
        connection.close()

    detail = authed_client.get(f"/api/saved-documents/{created['id']}").json()
    assert detail["fields"]["party1Name"] == ""
    assert detail["fields"]["party2Name"] == "Acme Inc."
