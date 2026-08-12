import pytest

from app.documents import field_key, get_document_detail, load_catalog, parse_template


class TestFieldKey:
    def test_single_word(self):
        assert field_key("Customer") == "customer"

    def test_multi_word_becomes_camel_case(self):
        assert field_key("Training Purposes") == "trainingPurposes"

    def test_strips_straight_apostrophe_possessive(self):
        assert field_key("Customer's") == "customer"

    def test_strips_curly_apostrophe_possessive(self):
        assert field_key("Customer’s") == "customer"

    def test_possessive_and_bare_form_share_a_key(self):
        assert field_key("Provider") == field_key("Provider’s")


class TestParseTemplate:
    def test_flat_numbered_list_with_no_nesting(self):
        markdown = (
            "# Standard Terms\n\n"
            '1. **Introduction**. This uses <span class="coverpage_link">Purpose</span> here.\n\n'
            "2. **Term**. Simple second section with no fields.\n"
        )
        doc = parse_template("Test Doc", "desc", "test.md", markdown)

        assert [b.level for b in doc.blocks] == [1, 1]
        assert doc.blocks[0].number == "1"
        assert doc.blocks[0].heading == "Introduction"
        assert doc.blocks[1].heading == "Term"
        assert [f.key for f in doc.fields] == ["purpose"]

    def test_nested_numbered_list(self):
        markdown = (
            "# Standard Terms\n\n"
            '1. <span class="header_2" id="1">Service</span>\n'
            '    1. <span class="header_3" id="1.1">Access.</span> Uses '
            '<span class="coverpage_link">Customer</span> here.\n'
            '    2. <span class="header_3" id="1.2">Support.</span> No fields here.\n'
        )
        doc = parse_template("Test Doc", "desc", "test.md", markdown)

        levels = [(b.level, b.number, b.heading) for b in doc.blocks]
        assert levels == [
            (1, "1", "Service"),
            (2, "1.1", "Access."),
            (2, "1.2", "Support."),
        ]
        # A container item that's purely a heading for its sub-items has no runs of its own.
        assert doc.blocks[0].runs == []

    def test_possessive_and_bare_label_collapse_to_one_field_with_shortest_label(self):
        markdown = (
            "# Standard Terms\n\n"
            '1. **A**. First <span class="coverpage_link">Customer’s</span> data, '
            'then <span class="coverpage_link">Customer</span> itself.\n'
        )
        doc = parse_template("Test Doc", "desc", "test.md", markdown)

        assert len(doc.fields) == 1
        assert doc.fields[0].key == "customer"
        assert doc.fields[0].label == "Customer"
        # Both occurrences still render with their own original (possibly possessive) text.
        field_runs = [r for r in doc.blocks[0].runs if r.kind == "field"]
        assert [r.text for r in field_runs] == ["Customer’s", "Customer"]
        assert all(r.fieldKey == "customer" for r in field_runs)

    def test_survives_malformed_trailing_span_tag(self):
        markdown = (
            "# Standard Terms\n\n"
            '1. <span id="1.1">**"Variable"**</span></span> means a defined term.\n'
        )
        doc = parse_template("Test Doc", "desc", "test.md", markdown)

        assert doc.blocks[0].heading == '"Variable"'
        assert "span" not in doc.blocks[0].runs[0].text.lower()

    def test_mutual_nda_gets_supplemental_party_fields(self):
        markdown = (
            "# Standard Terms\n\n"
            '1. **Introduction**. Uses <span class="coverpage_link">Purpose</span>.\n'
        )
        doc = parse_template("Mutual Non-Disclosure Agreement", "desc", "Mutual-NDA.md", markdown)

        keys = [f.key for f in doc.fields]
        assert keys == ["party1Name", "party1Address", "party2Name", "party2Address", "purpose"]

    def test_other_documents_do_not_get_supplemental_fields(self):
        markdown = "# Standard Terms\n\n1. **A**. No fields at all.\n"
        doc = parse_template("Other Doc", "desc", "Other.md", markdown)
        assert doc.fields == []


class TestRealCatalog:
    """Sanity checks against the actual templates/ directory, since the parser
    was built against its real (occasionally messy) structure."""

    def test_catalog_loads_all_eleven_entries(self):
        entries = load_catalog()
        assert len(entries) == 11

    @pytest.mark.parametrize("filename", [e.id for e in load_catalog()])
    def test_every_template_parses_without_error_and_has_fields(self, filename):
        detail = get_document_detail(filename)
        assert detail is not None
        assert len(detail.blocks) > 0
        assert len(detail.fields) > 0
        # Field keys must be unique and non-empty.
        keys = [f.key for f in detail.fields]
        assert len(keys) == len(set(keys))
        assert all(keys)

    def test_mutual_nda_has_party_fields_the_others_lack_by_default(self):
        detail = get_document_detail("Mutual-NDA.md")
        assert {"party1Name", "party1Address", "party2Name", "party2Address"} <= {
            f.key for f in detail.fields
        }

    def test_csa_has_customer_and_provider_fields(self):
        detail = get_document_detail("CSA.md")
        keys = {f.key for f in detail.fields}
        assert "customer" in keys
        assert "provider" in keys

    def test_unknown_document_id_returns_none(self):
        assert get_document_detail("Nonexistent.md") is None
