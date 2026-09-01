DEMO_URL = "/api/demo"


def test_demo_is_reachable_without_a_session(client):
    """The whole point of the demo: a visitor who has never signed in can see
    what the app does. Every other document route is gated."""
    client.cookies.clear()

    response = client.get(DEMO_URL)

    assert response.status_code == 200


def test_demo_returns_the_mutual_nda(client):
    body = client.get(DEMO_URL).json()

    assert body["detail"]["id"] == "Mutual-NDA.md"
    assert body["detail"]["name"] == "Mutual Non-Disclosure Agreement"
    assert len(body["detail"]["blocks"]) > 0


def test_demo_is_part_filled_so_the_meter_reads_mid_progress(client):
    """A full document demonstrates the output; a part-filled one demonstrates
    the mechanic. Some fields answered, some still outstanding."""
    body = client.get(DEMO_URL).json()

    keys = {field["key"] for field in body["detail"]["fields"]}
    filled = {key for key, value in body["fields"].items() if value}

    assert filled, "nothing seeded - the meter would read empty"
    assert filled < keys, "everything seeded - the meter would read complete"
    assert filled <= keys, f"seeded keys not on the document: {filled - keys}"


def test_demo_carries_a_chat_transcript_ending_on_a_question(client):
    """The transcript has to end mid-conversation, on the assistant asking for
    the next field, or it reads as a finished job rather than a live one."""
    body = client.get(DEMO_URL).json()
    messages = body["messages"]

    assert len(messages) >= 2
    assert {m["role"] for m in messages} == {"user", "assistant"}
    assert messages[0]["role"] == "assistant"
    assert messages[-1]["role"] == "assistant"
    assert messages[-1]["content"].rstrip().endswith("?")


def test_demo_parties_are_recognisably_fictional(client):
    """Rendered in the real document styling, a realistic NDA between named
    companies is one screenshot away from being taken for a real agreement."""
    body = client.get(DEMO_URL).json()

    assert body["isExample"] is True
    assert "Acme" in body["fields"]["party1Name"]


def test_demo_does_not_leak_the_rest_of_the_catalog(client):
    """The demo route exists so /api/documents/* can stay gated. Confirm it
    did not become an enumeration path."""
    client.cookies.clear()

    assert client.get("/api/documents").status_code == 401
    assert client.get("/api/documents/CSA.md").status_code == 401


def test_demo_is_read_only(client):
    """No writes, so nothing to authorise and nothing to abuse."""
    client.cookies.clear()

    assert client.post(DEMO_URL).status_code == 405
