import json
import re
from functools import lru_cache
from typing import Literal

from pydantic import BaseModel

from .config import get_catalog_path, get_templates_dir

# Matches a Common Paper fillable-field span, e.g. <span class="coverpage_link">Purpose</span>
# or <span class="orderform_link" id="2.1">Customer's</span>. Any "..._link" class is a field,
# regardless of which named section (Cover Page, Key Terms, Order Form, ...) it belongs to.
_FIELD_SPAN = re.compile(r'<span[^>]*class="[a-z]+_link"[^>]*>(.*?)</span>', re.DOTALL)
# Section-heading spans (only used by the 10 non-Mutual-NDA templates) carry their heading text
# as plain, unbolded content, unlike every other heading-like span in these templates (which are
# always written as **bold** markdown). Normalizing them to **bold** here means the rest of the
# parser only ever has to recognize one heading convention: "the first bold run in an item".
_HEADING_SPAN = re.compile(r'<span[^>]*class="header_[23]"[^>]*>(.*?)</span>', re.DOTALL)
# Any other span (anchors, ids, and the occasional malformed/unbalanced tag in the source
# markdown) is decorative - drop the tags, keep the inner text.
_OTHER_SPAN_TAG = re.compile(r"</?span[^>]*>")

_TOP_LEVEL_ITEM = re.compile(r"^(\d+)\.[ \t]+", re.MULTILINE)
_NESTED_ITEM = re.compile(r"^[ \t]{2,8}(\d+)\.[ \t]+", re.MULTILINE)
_TRAILING_POSSESSIVE = re.compile(r"[’']s$")


class CatalogEntry(BaseModel):
    id: str
    name: str
    description: str


class FieldDef(BaseModel):
    key: str
    label: str


class DocumentRun(BaseModel):
    kind: Literal["text", "field"]
    text: str
    bold: bool = False
    fieldKey: str | None = None


class DocumentBlock(BaseModel):
    level: Literal[1, 2]
    number: str
    heading: str | None
    runs: list[DocumentRun]


class DocumentDetail(BaseModel):
    id: str
    name: str
    description: str
    fields: list[FieldDef]
    blocks: list[DocumentBlock]
    sourceAttribution: str


# Mutual NDA's Standard Terms text never names the parties inline (they're
# only ever referred to by role, e.g. "Disclosing Party") - a real cover page
# would collect this, but this template file only contains the Standard
# Terms. Kept as a small, explicit exception so a generated Mutual NDA can
# still say who it's between, matching what already shipped in LEG-3/LEG-5.
_SUPPLEMENTAL_FIELDS: dict[str, list[FieldDef]] = {
    "Mutual-NDA.md": [
        FieldDef(key="party1Name", label="Party 1 Name"),
        FieldDef(key="party1Address", label="Party 1 Address"),
        FieldDef(key="party2Name", label="Party 2 Name"),
        FieldDef(key="party2Address", label="Party 2 Address"),
    ]
}


def field_key(label: str) -> str:
    """Derive a stable identifier from a field's display label.

    Strips a trailing possessive ('s / 's) first, since e.g. "Customer" and
    "Customer's" are the same underlying field, just referenced two different
    grammatical ways in the template body.
    """
    canonical = _TRAILING_POSSESSIVE.sub("", label.strip())
    words = re.findall(r"[A-Za-z0-9]+", canonical)
    if not words:
        return "field"
    first, *rest = words
    return first.lower() + "".join(w.capitalize() for w in rest)


def _tokenize(text: str) -> list[DocumentRun]:
    """Turn a block's cleaned-up text into text/bold/field runs.

    Field spans are pulled out first (and replaced with a placeholder token
    unlikely to collide with real content), heading spans are normalized to
    **bold** markdown, then everything else is a straightforward split on
    "**bold**" segments and the field placeholder tokens.
    """
    field_labels: list[str] = []

    def stash_field(match: re.Match[str]) -> str:
        label = _OTHER_SPAN_TAG.sub("", match.group(1)).strip()
        field_labels.append(label)
        return f"\x00FIELD{len(field_labels) - 1}\x00"

    text = _FIELD_SPAN.sub(stash_field, text)
    text = _HEADING_SPAN.sub(lambda m: f"**{_OTHER_SPAN_TAG.sub('', m.group(1)).strip()}**", text)
    text = _OTHER_SPAN_TAG.sub("", text)
    text = re.sub(r"\s+", " ", text).strip()

    runs: list[DocumentRun] = []
    for chunk in re.split(r"(\*\*.+?\*\*|\x00FIELD\d+\x00)", text):
        if not chunk:
            continue
        field_match = re.match(r"^\x00FIELD(\d+)\x00$", chunk)
        if field_match:
            label = field_labels[int(field_match.group(1))]
            runs.append(DocumentRun(kind="field", text=label, fieldKey=field_key(label)))
            continue
        bold_match = re.match(r"^\*\*(.+)\*\*$", chunk)
        if bold_match:
            runs.append(DocumentRun(kind="text", text=bold_match.group(1), bold=True))
            continue
        runs.append(DocumentRun(kind="text", text=chunk))
    return runs


def _split_items(text: str, pattern: re.Pattern[str]) -> list[str]:
    """Split on a numbered-list marker pattern, dropping the captured number
    (blocks are renumbered positionally rather than trusting the source
    markdown's own digits, which are only unique within their own nesting
    level anyway)."""
    parts = pattern.split(text)
    # parts alternates [preamble, number, body, number, body, ...]
    return [body for body in parts[2::2]]


def _heading_and_runs(text: str) -> tuple[str | None, list[DocumentRun]]:
    """A block's heading, if any, is just its first bold run - whether that
    bold run came from **markdown** in the source or was normalized from a
    header_2/header_3 span by _tokenize."""
    runs = _tokenize(text)
    if runs and runs[0].kind == "text" and runs[0].bold:
        return runs[0].text, runs[1:]
    return None, runs


def parse_template(name: str, description: str, doc_id: str, markdown: str) -> DocumentDetail:
    body = re.sub(r"^#.*\n", "", markdown, count=1).strip()
    top_level_bodies = _split_items(body, _TOP_LEVEL_ITEM)

    blocks: list[DocumentBlock] = []
    for i, raw in enumerate(top_level_bodies, start=1):
        own_text = _NESTED_ITEM.split(raw, maxsplit=1)[0]
        heading, runs = _heading_and_runs(own_text)
        blocks.append(DocumentBlock(level=1, number=str(i), heading=heading, runs=runs))

        nested_bodies = _split_items(raw, _NESTED_ITEM)
        for j, nested_raw in enumerate(nested_bodies, start=1):
            nested_heading, nested_runs = _heading_and_runs(nested_raw)
            blocks.append(
                DocumentBlock(
                    level=2, number=f"{i}.{j}", heading=nested_heading, runs=nested_runs
                )
            )

    # When multiple raw labels normalize to the same key (e.g. "Customer" and
    # "Customer's"), prefer the shortest as the canonical display label - it's
    # reliably the bare, non-possessive form.
    seen_keys: dict[str, str] = {}
    for block in blocks:
        for run in block.runs:
            if run.kind != "field" or not run.fieldKey:
                continue
            label = run.text.strip()
            existing = seen_keys.get(run.fieldKey)
            if existing is None or len(label) < len(existing):
                seen_keys[run.fieldKey] = label

    fields = _SUPPLEMENTAL_FIELDS.get(doc_id, []) + [
        FieldDef(key=key, label=label) for key, label in seen_keys.items()
    ]
    attribution = (
        f"Adapted from the Common Paper {name} template (see templates/LICENSE.txt), "
        "licensed under CC BY 4.0 (creativecommons.org/licenses/by/4.0). Field values below "
        "are filled in from user input; the template text is otherwise unmodified."
    )
    return DocumentDetail(
        id=doc_id,
        name=name,
        description=description,
        fields=fields,
        blocks=blocks,
        sourceAttribution=attribution,
    )


@lru_cache(maxsize=1)
def load_catalog() -> list[CatalogEntry]:
    raw = json.loads(get_catalog_path().read_text(encoding="utf-8"))
    return [CatalogEntry(id=entry["filename"], name=entry["name"], description=entry["description"]) for entry in raw]


@lru_cache(maxsize=None)
def get_document_detail(doc_id: str) -> DocumentDetail | None:
    entry = next((e for e in load_catalog() if e.id == doc_id), None)
    if entry is None:
        return None
    template_path = get_templates_dir() / entry.id
    markdown = template_path.read_text(encoding="utf-8")
    return parse_template(entry.name, entry.description, entry.id, markdown)
