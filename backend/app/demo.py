"""The seeded document a logged-out visitor lands on.

Everything here is fixture, not data: fixed content served to anyone, stored
nowhere, and never written to. It exists so the first screen shows the app
working rather than a sign-in form.

The parties are deliberately fictional and the payload carries `isExample`,
because this renders in the same styling as a real agreement and a screenshot
of it should not be mistakable for one."""

from pydantic import BaseModel

from .documents import DocumentDetail, get_document_detail
from .schemas import ChatMessage

DEMO_DOCUMENT_ID = "Mutual-NDA.md"

# Four of the Mutual NDA's ten fields, matching the transcript below. Part-way
# rather than complete: a full document shows the output, a part-filled one
# shows the mechanic, and the ruled meter only reads as a progress meter when
# it is mid-stride.
DEMO_FIELDS: dict[str, str] = {
    "party1Name": "Acme Corp",
    "party1Address": "1 Bridge Street, Bristol BS1 2AA, United Kingdom",
    "party2Name": "Beta Industries",
    "party2Address": "44 Harbour Road, Dublin D02 XY45, Ireland",
}

# Ends on the assistant's question, so the conversation reads as live rather
# than finished - the visitor arrives at the moment it is their turn.
DEMO_MESSAGES: list[ChatMessage] = [
    ChatMessage(
        role="assistant",
        content=(
            "Let's fill in your Mutual Non-Disclosure Agreement. "
            "Who are the two parties signing it?"
        ),
    ),
    ChatMessage(role="user", content="Acme Corp and Beta Industries."),
    ChatMessage(
        role="assistant",
        content="Got those. What are their registered addresses?",
    ),
    ChatMessage(
        role="user",
        content=(
            "Acme is at 1 Bridge Street, Bristol BS1 2AA, United Kingdom. "
            "Beta is at 44 Harbour Road, Dublin D02 XY45, Ireland."
        ),
    ),
    ChatMessage(
        role="assistant",
        content=(
            "Both parties are on the document now. "
            "What's the purpose the two of you will be sharing information for?"
        ),
    ),
]


class DemoResponse(BaseModel):
    """Everything the demo screen needs, in one request.

    The parsed document ships alongside the seeded values so that
    /api/documents/* can stay behind authentication - the demo needs exactly
    one document and has no business being able to enumerate the other ten."""

    detail: DocumentDetail
    fields: dict[str, str]
    messages: list[ChatMessage]
    isExample: bool = True


def build_demo() -> DemoResponse:
    detail = get_document_detail(DEMO_DOCUMENT_ID)
    if detail is None:
        # Only reachable if the template or catalog entry is removed, which the
        # document tests would already have caught.
        raise RuntimeError(f"demo template {DEMO_DOCUMENT_ID} is missing")
    return DemoResponse(detail=detail, fields=dict(DEMO_FIELDS), messages=list(DEMO_MESSAGES))
