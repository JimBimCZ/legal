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


@pytest.fixture()
def mock_completion(monkeypatch):
    """Stub out the litellm call so tests never hit the network."""
    calls = []

    def fake_completion(**kwargs):
        calls.append(kwargs)
        fields = {
            "party1Name": "Acme Inc.",
            "party1Address": "",
            "party2Name": "",
            "party2Address": "",
            "effectiveDate": "",
            "purpose": "",
            "mndaTerm": "",
            "termOfConfidentiality": "",
            "governingLaw": "",
            "jurisdiction": "",
        }
        content = json.dumps({"reply": "Got it, what's the other party's name?", "fields": fields})
        return FakeResponse(content)

    monkeypatch.setattr("app.nda_chat.completion", fake_completion)
    return calls


def test_chat_returns_reply_and_updated_fields(client, mock_completion):
    response = client.post(
        "/api/chat",
        json={"messages": [{"role": "user", "content": "The first party is Acme Inc."}]},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["reply"] == "Got it, what's the other party's name?"
    assert body["fields"]["party1Name"] == "Acme Inc."
    assert body["fields"]["party2Name"] == ""


def test_chat_sends_known_fields_and_history_to_the_model(client, mock_completion):
    client.post(
        "/api/chat",
        json={
            "messages": [
                {"role": "assistant", "content": "Who are the two parties?"},
                {"role": "user", "content": "Acme Inc. and Globex Corporation."},
            ],
            "fields": {"party1Name": "Acme Inc."},
        },
    )
    assert len(mock_completion) == 1
    sent_messages = mock_completion[0]["messages"]
    assert sent_messages[0]["role"] == "system"
    assert "Acme Inc." in sent_messages[0]["content"]
    assert sent_messages[-1] == {"role": "user", "content": "Acme Inc. and Globex Corporation."}


def test_chat_rejects_empty_message_list(client, mock_completion):
    response = client.post("/api/chat", json={"messages": []})
    assert response.status_code == 422


def test_chat_rejects_empty_message_content(client, mock_completion):
    response = client.post("/api/chat", json={"messages": [{"role": "user", "content": ""}]})
    assert response.status_code == 422


def test_chat_returns_502_when_llm_call_fails(client, monkeypatch):
    def failing_completion(**kwargs):
        raise RuntimeError("upstream is down")

    monkeypatch.setattr("app.nda_chat.completion", failing_completion)

    response = client.post(
        "/api/chat", json={"messages": [{"role": "user", "content": "Hello"}]}
    )
    assert response.status_code == 502
