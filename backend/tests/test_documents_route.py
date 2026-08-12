def test_list_documents_returns_the_full_catalog(authed_client):
    response = authed_client.get("/api/documents")
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 11
    assert {"id": "Mutual-NDA.md", "name": "Mutual Non-Disclosure Agreement", "description": body[0]["description"]} in body


def test_get_document_returns_fields_and_blocks(authed_client):
    response = authed_client.get("/api/documents/Mutual-NDA.md")
    assert response.status_code == 200
    body = response.json()
    assert body["id"] == "Mutual-NDA.md"
    assert {"key": "party1Name", "label": "Party 1 Name"} in body["fields"]
    assert len(body["blocks"]) > 0
    assert body["sourceAttribution"]


def test_get_unknown_document_returns_404(authed_client):
    response = authed_client.get("/api/documents/Nonexistent.md")
    assert response.status_code == 404


def test_list_documents_requires_authentication(client):
    response = client.get("/api/documents")
    assert response.status_code == 401
