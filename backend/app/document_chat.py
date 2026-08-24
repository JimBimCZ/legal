import re

from litellm import completion
from pydantic import BaseModel, create_model

from .documents import CatalogEntry, FieldDef, get_document_detail, load_catalog

MODEL = "openrouter/openai/gpt-oss-120b"
EXTRA_BODY = {"provider": {"order": ["cerebras"]}}

# Phrases the model reaches for when it wants to say "the user hasn't told me
# this yet" but the schema forces it to return a string anyway. Stored as-is
# these are non-blank, so the frontend's "every field filled" download gate
# treats the document as complete and happily renders them into the PDF -
# hence they're normalized back to "" (genuinely unknown) on the way through.
# Deliberately narrow: "N/A" and "none" are left off, because those can be a
# real answer to a real field (e.g. a jurisdiction carve-out).
_UNKNOWN_VALUES = frozenset(
    {
        "not yet known",
        "not known",
        "unknown",
        "not yet provided",
        "not provided",
        "not yet specified",
        "not specified",
        "tbd",
        "to be determined",
        "to be confirmed",
        "not yet available",
        "pending",
    }
)

# The model has been seen echoing this prompt's own "(currently: ...)"
# scaffolding straight back as a field value. Unwrap it rather than discard,
# so a real value that arrives wearing the wrapper is still salvaged.
_CURRENTLY_WRAPPER = re.compile(r"^\(?\s*currently\s*:\s*(.*?)\s*\)?$", re.IGNORECASE | re.DOTALL)


class ChatTurnResult(BaseModel):
    reply: str
    selectedDocument: str | None
    selectedDocumentName: str | None
    fields: dict[str, str]


def clean_field_value(value: str) -> str:
    """Normalize one model-returned field value, mapping any "I don't know
    yet" stand-in to "" so it reads as unfilled everywhere downstream."""
    text = value.strip()
    wrapper = _CURRENTLY_WRAPPER.match(text)
    if wrapper:
        text = wrapper.group(1).strip()
    stripped = text.strip("()[]").strip().rstrip(".").strip()
    if stripped.lower() in _UNKNOWN_VALUES:
        return ""
    return text


def clean_fields(fields: dict[str, str]) -> dict[str, str]:
    return {key: clean_field_value(value) for key, value in fields.items()}


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
    # Known and missing fields are listed as two separate sections rather than
    # one list annotated with a "(currently: ...)" parenthetical, because the
    # model copied that parenthetical verbatim into the field values - which
    # then read as filled-in everywhere downstream, including the PDF.
    known_lines = "\n".join(
        f"- {f.label}: {known_fields[f.key]}"
        for f in field_defs
        if (known_fields.get(f.key) or "").strip()
    )
    missing_lines = "\n".join(
        f"- {f.label}" for f in field_defs if not (known_fields.get(f.key) or "").strip()
    )
    known_section = (
        f"Values the user has already given you:\n\n{known_lines}"
        if known_lines
        else "The user has not given you any values yet."
    )
    missing_section = (
        f"Fields still missing:\n\n{missing_lines}"
        if missing_lines
        else "Every field now has a value."
    )
    return (
        f"You are a friendly assistant helping a user fill out a {selected.name}. Have a "
        "natural conversation, asking about a couple of related fields at a time rather than "
        "listing all of them at once. The two lists below are your source of truth for what "
        "is already known.\n\n"
        f"{known_section}\n\n"
        f"{missing_section}\n\n"
        "In every response, return the full current value for every field: carry forward each "
        "already-given value verbatim unless the user's latest message corrects it. Never "
        "invent values the user hasn't provided or implied. For any field the user has not "
        "given you yet, return an empty string - never a placeholder and never a stand-in "
        "phrase such as 'not yet known', 'unknown', 'TBD', or a description of the field. "
        "Keep 'reply' conversational and focused on the next one or two fields still missing; "
        "once every field is known, confirm the details back to the user.\n\n"
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

    # Cleaned on the way in as well as on the way out, so a document already
    # holding stand-in values from an earlier turn is asked about again rather
    # than treated as answered forever.
    known_fields = clean_fields(known_fields)

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
    fields = (
        clean_fields(result.fields.model_dump())
        if unchanged_selection and hasattr(result, "fields")
        else {}
    )
    return ChatTurnResult(
        reply=result.reply,
        selectedDocument=resolved.id if resolved else None,
        selectedDocumentName=resolved.name if resolved else None,
        fields=fields,
    )
