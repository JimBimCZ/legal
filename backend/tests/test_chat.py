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
    """A plain list of received kwargs, plus a queue of dict responses the
    fake model should return next (one per call, in order)."""

    def __init__(self) -> None:
        super().__init__()
        self.queue: list[dict] = []


@pytest.fixture()
def mock_completion(monkeypatch):
    """Stub out the litellm call so tests never hit the network."""
    calls = RecordedCalls()

    def fake_completion(**kwargs):
        calls.append(kwargs)
        return FakeResponse(json.dumps(calls.queue.pop(0)))

    monkeypatch.setattr("app.document_chat.completion", fake_completion)
    return calls


def test_document_selection_turn_has_no_fields_yet(authed_client, mock_completion):
    mock_completion.queue.append(
        {"reply": "A Mutual NDA it is!", "selectedDocument": "Mutual Non-Disclosure Agreement"}
    )
    response = authed_client.post(
        "/api/chat",
        json={"messages": [{"role": "user", "content": "I need an NDA"}]},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["reply"] == "A Mutual NDA it is!"
    assert body["selectedDocument"] == "Mutual-NDA.md"
    assert body["selectedDocumentName"] == "Mutual Non-Disclosure Agreement"
    assert body["fields"] == {}


def test_document_selection_turn_can_leave_document_unset(authed_client, mock_completion):
    mock_completion.queue.append({"reply": "What kind of agreement do you need?"})
    response = authed_client.post(
        "/api/chat", json={"messages": [{"role": "user", "content": "I need a document"}]}
    )
    body = response.json()
    assert body["selectedDocument"] is None
    assert body["selectedDocumentName"] is None
    assert body["fields"] == {}


def test_hallucinated_document_name_resolves_to_no_selection(authed_client, mock_completion):
    mock_completion.queue.append(
        {"reply": "Sure!", "selectedDocument": "Some Document We Do Not Have"}
    )
    response = authed_client.post(
        "/api/chat", json={"messages": [{"role": "user", "content": "I need a widget agreement"}]}
    )
    body = response.json()
    assert body["selectedDocument"] is None


def test_field_collection_turn_returns_updated_fields_for_the_selected_document(
    authed_client, mock_completion
):
    mock_completion.queue.append(
        {
            "reply": "Got it, who's the provider?",
            "selectedDocument": "Cloud Service Agreement",
            "fields": {"customer": "Acme Inc."},
        }
    )
    response = authed_client.post(
        "/api/chat",
        json={
            "messages": [{"role": "user", "content": "The customer is Acme Inc."}],
            "selectedDocument": "CSA.md",
            "fields": {},
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["selectedDocument"] == "CSA.md"
    assert body["fields"]["customer"] == "Acme Inc."
    # Fields not mentioned by the mocked model default to empty, not missing.
    assert body["fields"]["provider"] == ""


def test_field_collection_prompt_carries_forward_known_values(authed_client, mock_completion):
    mock_completion.queue.append(
        {
            "reply": "Noted.",
            "selectedDocument": "Cloud Service Agreement",
            "fields": {"customer": "Acme Inc."},
        }
    )
    authed_client.post(
        "/api/chat",
        json={
            "messages": [{"role": "user", "content": "The provider is Globex."}],
            "selectedDocument": "CSA.md",
            "fields": {"customer": "Acme Inc."},
        },
    )
    system_prompt = mock_completion[0]["messages"][0]["content"]
    assert "Acme Inc." in system_prompt


def test_switching_documents_mid_conversation_discards_stale_fields(authed_client, mock_completion):
    mock_completion.queue.append(
        {
            "reply": "Switching you to a Data Processing Agreement.",
            "selectedDocument": "Data Processing Agreement",
            "fields": {"customer": "Acme Inc."},
        }
    )
    response = authed_client.post(
        "/api/chat",
        json={
            "messages": [{"role": "user", "content": "Actually, I need a DPA instead."}],
            "selectedDocument": "CSA.md",
            "fields": {"customer": "Acme Inc."},
        },
    )
    body = response.json()
    assert body["selectedDocument"] == "DPA.md"
    # Fields were collected against CSA's schema, not DPA's - they don't carry over.
    assert body["fields"] == {}


def test_chat_rejects_empty_message_list(authed_client, mock_completion):
    response = authed_client.post("/api/chat", json={"messages": []})
    assert response.status_code == 422


def test_chat_rejects_empty_message_content(authed_client, mock_completion):
    response = authed_client.post("/api/chat", json={"messages": [{"role": "user", "content": ""}]})
    assert response.status_code == 422


def test_chat_returns_502_when_llm_call_fails(authed_client, monkeypatch):
    def failing_completion(**kwargs):
        raise RuntimeError("upstream is down")

    monkeypatch.setattr("app.document_chat.completion", failing_completion)

    response = authed_client.post("/api/chat", json={"messages": [{"role": "user", "content": "Hello"}]})
    assert response.status_code == 502


def test_chat_requires_authentication(client, mock_completion):
    response = client.post("/api/chat", json={"messages": [{"role": "user", "content": "Hello"}]})
    assert response.status_code == 401
