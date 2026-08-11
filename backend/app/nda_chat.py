from litellm import completion
from pydantic import BaseModel, Field

MODEL = "openrouter/openai/gpt-oss-120b"
EXTRA_BODY = {"provider": {"order": ["cerebras"]}}


# Mirrors frontend/src/types/nda.ts MutualNdaFields — kept in lockstep with
# frontend/src/lib/mutualNdaContent.ts COVER_PAGE_FIELDS. Each field's
# description doubles as the prompt text the model sees for it, so the field
# list and its descriptions stay a single source of truth.
class NdaFields(BaseModel):
    party1Name: str = Field("", description="Legal name of the first party")
    party1Address: str = Field("", description="Mailing address of the first party")
    party2Name: str = Field("", description="Legal name of the second party")
    party2Address: str = Field("", description="Mailing address of the second party")
    effectiveDate: str = Field(
        "", description="Date the agreement takes effect, formatted strictly as YYYY-MM-DD"
    )
    purpose: str = Field(
        "", description="The business purpose for which confidential information will be shared"
    )
    mndaTerm: str = Field(
        "",
        description="How long the agreement itself lasts, e.g. '2 years from the Effective Date'",
    )
    termOfConfidentiality: str = Field(
        "", description="How long confidentiality obligations survive after the agreement ends"
    )
    governingLaw: str = Field("", description="US state whose law governs the agreement")
    jurisdiction: str = Field("", description="County/state where legal disputes must be filed")


class ChatTurnResult(BaseModel):
    reply: str
    fields: NdaFields


def build_system_prompt(known_fields: NdaFields) -> str:
    field_lines = "\n".join(
        f"- {name}: {field.description} (currently: {getattr(known_fields, name) or 'not yet known'})"
        for name, field in NdaFields.model_fields.items()
    )
    return (
        "You are a friendly assistant helping a user fill out a Mutual Non-Disclosure "
        "Agreement (Mutual NDA). Have a natural conversation, asking about a couple of "
        "related fields at a time rather than listing all of them at once. Use the fields "
        "listed below and their current values as your source of truth for what is already "
        "known.\n\n"
        f"{field_lines}\n\n"
        "In every response, return the full current value for every field: carry forward "
        "each field's current value unless the user's latest message gives new or corrected "
        "information for it. Never invent values the user hasn't provided or implied. Keep "
        "'reply' conversational and focused on the next one or two fields still missing; "
        "once every field is known, confirm the details back to the user."
    )


def run_chat_turn(messages: list[dict[str, str]], known_fields: NdaFields) -> ChatTurnResult:
    llm_messages = [
        {"role": "system", "content": build_system_prompt(known_fields)},
        *messages,
    ]
    response = completion(
        model=MODEL,
        messages=llm_messages,
        response_format=ChatTurnResult,
        reasoning_effort="low",
        extra_body=EXTRA_BODY,
    )
    result = response.choices[0].message.content
    return ChatTurnResult.model_validate_json(result)
