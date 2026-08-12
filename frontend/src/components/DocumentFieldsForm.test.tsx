import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { DocumentFieldsForm } from "@/components/DocumentFieldsForm";
import { TEST_DOCUMENT } from "@/lib/documentTestFixtures";
import type { DocumentFields } from "@/types/document";

/** Mirrors how the real Home page wires state, so typing accumulates like it would for a user. */
function StatefulForm() {
  const [values, setValues] = useState<DocumentFields>({});
  function onFieldChange(key: string, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }
  return (
    <DocumentFieldsForm fieldDefs={TEST_DOCUMENT.fields} values={values} onFieldChange={onFieldChange} />
  );
}

describe("DocumentFieldsForm", () => {
  it("renders a labeled text input for every field def", () => {
    render(<DocumentFieldsForm fieldDefs={TEST_DOCUMENT.fields} values={{}} onFieldChange={vi.fn()} />);
    for (const field of TEST_DOCUMENT.fields) {
      const input = screen.getByLabelText(field.label);
      expect(input.tagName).toBe("INPUT");
      expect(input).toHaveAttribute("type", "text");
    }
  });

  it("reflects the current field values (controlled inputs)", () => {
    render(
      <DocumentFieldsForm
        fieldDefs={TEST_DOCUMENT.fields}
        values={{ customer: "Acme Inc." }}
        onFieldChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Customer")).toHaveValue("Acme Inc.");
  });

  it("calls onFieldChange with the field key and each keystroke's value", async () => {
    const user = userEvent.setup();
    const onFieldChange = vi.fn();
    render(<DocumentFieldsForm fieldDefs={TEST_DOCUMENT.fields} values={{}} onFieldChange={onFieldChange} />);

    await user.type(screen.getByLabelText("Customer"), "Ac");

    // The values prop is held fixed in this render, so each keystroke reports
    // just the character typed (the parent is responsible for accumulating it).
    expect(onFieldChange.mock.calls).toEqual([
      ["customer", "A"],
      ["customer", "c"],
    ]);
  });

  it("accumulates typed characters end-to-end when wired to real state, like the Home page does", async () => {
    const user = userEvent.setup();
    render(<StatefulForm />);

    await user.type(screen.getByLabelText("Customer"), "Acme");

    expect(screen.getByLabelText("Customer")).toHaveValue("Acme");
  });

  it("keeps each field's state independent of the others", async () => {
    const user = userEvent.setup();
    render(<StatefulForm />);

    await user.type(screen.getByLabelText("Customer"), "Acme");
    await user.type(screen.getByLabelText("Effective Date"), "2026-03-05");

    expect(screen.getByLabelText("Customer")).toHaveValue("Acme");
    expect(screen.getByLabelText("Effective Date")).toHaveValue("2026-03-05");
  });

  it("renders no inputs for a document with no fields", () => {
    render(<DocumentFieldsForm fieldDefs={[]} values={{}} onFieldChange={vi.fn()} />);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("does not submit or reload the page when the form is submitted", () => {
    const { container } = render(
      <DocumentFieldsForm fieldDefs={TEST_DOCUMENT.fields} values={{}} onFieldChange={vi.fn()} />,
    );
    const form = container.querySelector("form")!;
    const submitEvent = new Event("submit", { bubbles: true, cancelable: true });
    form.dispatchEvent(submitEvent);
    expect(submitEvent.defaultPrevented).toBe(true);
  });
});
