from litellm import completion
from pydantic import BaseModel, create_model

from .documents import CatalogEntry, FieldDef, get_document_detail, load_catalog

MODEL = "openrouter/openai/gpt-oss-120b"
EXTRA_BODY = {"provider": {"order": ["cerebras"]}}


class ChatTurnResult(BaseModel):
    reply: str
    selectedDocument: str | None
    selectedDocumentName: str | None
    fields: dict[str, str]


def _catalog_lines(catalog: list[CatalogEntry]) -> str:
    return "\n".join(f"- {entry.name}: {entry.description}" for entry in catalog)


def _resolve_document_name(name: str | None, catalog: list[CatalogEntry]) -> CatalogEntry | None:
    if not name:
        return None
    normalized = name.strip().lower()
    return next((entry for entry in catalog if entry.name.lower() == normalized), None)


def _selection_schema() -> type[BaseModel]:
    return create_model(
        "DocumentSelectionResult", reply=(str, ...), selectedDocument=(str | None, None)
    )


def _selection_prompt(catalog: list[CatalogEntry]) -> str:
    return (
        "You are a friendly assistant helping a user draft a legal agreement. We only support "
        "generating the following document types:\n\n"
        f"{_catalog_lines(catalog)}\n\n"
        "Figure out which document the user wants. If it's not clear yet, ask a short "
        "clarifying question and leave 'selectedDocument' unset. If the user asks for something "
        "not on this list, clearly explain that we can't generate that, then propose the single "
        "closest document from the list above and ask if that works for them - do not set "
        "'selectedDocument' until they've confirmed. Once you and the user agree on one of the "
        "documents above, set 'selectedDocument' to its exact name from the list."
    )


def _field_collection_schema(field_defs: list[FieldDef]) -> type[BaseModel]:
    fields_model = create_model("DocumentFields", **{f.key: (str, "") for f in field_defs})
    return create_model(
        "DocumentChatResult",
        reply=(str, ...),
        selectedDocument=(str | None, None),
        fields=(fields_model, ...),
    )


def _field_collection_prompt(
    catalog: list[CatalogEntry],
    selected: CatalogEntry,
    field_defs: list[FieldDef],
    known_fields: dict[str, str],
) -> str:
    field_lines = "\n".join(
        f"- {f.label}: (currently: {known_fields.get(f.key) or 'not yet known'})"
        for f in field_defs
    )
    return (
        f"You are a friendly assistant helping a user fill out a {selected.name}. Have a "
        "natural conversation, asking about a couple of related fields at a time rather than "
        "listing all of them at once. Use the fields listed below and their current values as "
        "your source of truth for what is already known.\n\n"
        f"{field_lines}\n\n"
        "In every response, return the full current value for every field: carry forward each "
        "field's current value unless the user's latest message gives new or corrected "
        "information for it. Never invent values the user hasn't provided or implied. Keep "
        "'reply' conversational and focused on the next one or two fields still missing; once "
        "every field is known, confirm the details back to the user.\n\n"
        f"Set 'selectedDocument' to \"{selected.name}\" unless the user clearly asks to switch "
        "to a different, specific document from this list instead:\n\n"
        f"{_catalog_lines(catalog)}"
    )


def run_chat_turn(
    messages: list[dict[str, str]],
    selected_document_id: str | None,
    known_fields: dict[str, str],
) -> ChatTurnResult:
    catalog = load_catalog()
    selected = next((e for e in catalog if e.id == selected_document_id), None)

    if selected is None:
        schema = _selection_schema()
        system_prompt = _selection_prompt(catalog)
    else:
        field_defs = get_document_detail(selected.id).fields
        schema = _field_collection_schema(field_defs)
        system_prompt = _field_collection_prompt(catalog, selected, field_defs, known_fields)

    llm_messages = [{"role": "system", "content": system_prompt}, *messages]
    response = completion(
        model=MODEL,
        messages=llm_messages,
        response_format=schema,
        reasoning_effort="low",
        extra_body=EXTRA_BODY,
    )
    result = schema.model_validate_json(response.choices[0].message.content)

    resolved = _resolve_document_name(result.selectedDocument, catalog)
    # Only trust the returned field values when they were collected for the
    # same document the caller already had selected. If this turn newly
    # selected or switched documents, the schema (if any) was still shaped
    # for the *previous* document, so its field values don't apply - the
    # caller starts field collection fresh on the next turn instead.
    unchanged_selection = selected is not None and resolved is not None and resolved.id == selected.id
    fields = result.fields.model_dump() if unchanged_selection and hasattr(result, "fields") else {}
    return ChatTurnResult(
        reply=result.reply,
        selectedDocument=resolved.id if resolved else None,
        selectedDocumentName=resolved.name if resolved else None,
        fields=fields,
    )
