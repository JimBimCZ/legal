import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { NdaForm } from "@/components/NdaForm";
import { COVER_PAGE_FIELDS } from "@/lib/mutualNdaContent";
import { EMPTY_NDA_FIELDS, type NdaFieldKey } from "@/types/nda";

/** Mirrors how the real Home page wires state, so typing accumulates like it would for a user. */
function StatefulNdaForm() {
  const [fields, setFields] = useState(EMPTY_NDA_FIELDS);
  function onFieldChange(key: NdaFieldKey, value: string) {
    setFields((current) => ({ ...current, [key]: value }));
  }
  return <NdaForm fields={fields} onFieldChange={onFieldChange} />;
}

describe("NdaForm", () => {
  it("renders a labeled input for every cover page field", () => {
    render(<NdaForm fields={EMPTY_NDA_FIELDS} onFieldChange={vi.fn()} />);
    for (const field of COVER_PAGE_FIELDS) {
      expect(screen.getByLabelText(field.label)).toBeInTheDocument();
    }
  });

  it("renders a textarea for textarea-type fields and a plain input otherwise", () => {
    render(<NdaForm fields={EMPTY_NDA_FIELDS} onFieldChange={vi.fn()} />);
    expect(screen.getByLabelText("Purpose").tagName).toBe("TEXTAREA");
    expect(screen.getByLabelText("Party 1 Name").tagName).toBe("INPUT");
  });

  it("uses the date input type for the effective date field", () => {
    render(<NdaForm fields={EMPTY_NDA_FIELDS} onFieldChange={vi.fn()} />);
    expect(screen.getByLabelText("Effective Date")).toHaveAttribute("type", "date");
  });

  it("reflects the current field values (controlled inputs)", () => {
    render(
      <NdaForm
        fields={{ ...EMPTY_NDA_FIELDS, party1Name: "Acme Inc." }}
        onFieldChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Party 1 Name")).toHaveValue("Acme Inc.");
  });

  it("calls onFieldChange with the field key and each keystroke's value", async () => {
    const user = userEvent.setup();
    const onFieldChange = vi.fn();
    render(<NdaForm fields={EMPTY_NDA_FIELDS} onFieldChange={onFieldChange} />);

    await user.type(screen.getByLabelText("Party 1 Name"), "Ac");

    // The field prop is held fixed in this render, so each keystroke reports
    // just the character typed (the parent is responsible for accumulating it).
    expect(onFieldChange.mock.calls).toEqual([
      ["party1Name", "A"],
      ["party1Name", "c"],
    ]);
  });

  it("accumulates typed characters end-to-end when wired to real state, like the Home page does", async () => {
    const user = userEvent.setup();
    render(<StatefulNdaForm />);

    await user.type(screen.getByLabelText("Party 1 Name"), "Acme");

    expect(screen.getByLabelText("Party 1 Name")).toHaveValue("Acme");
  });

  it("calls onFieldChange for the textarea field", async () => {
    const user = userEvent.setup();
    render(<StatefulNdaForm />);

    await user.type(screen.getByLabelText("Purpose"), "hi");

    expect(screen.getByLabelText("Purpose")).toHaveValue("hi");
  });

  it("keeps each field's state independent of the others", async () => {
    const user = userEvent.setup();
    render(<StatefulNdaForm />);

    await user.type(screen.getByLabelText("Party 1 Name"), "Acme");
    await user.type(screen.getByLabelText("Party 2 Name"), "Globex");

    expect(screen.getByLabelText("Party 1 Name")).toHaveValue("Acme");
    expect(screen.getByLabelText("Party 2 Name")).toHaveValue("Globex");
  });

  it("does not submit or reload the page when the form is submitted", () => {
    const { container } = render(<NdaForm fields={EMPTY_NDA_FIELDS} onFieldChange={vi.fn()} />);
    const form = container.querySelector("form")!;
    const submitEvent = new Event("submit", { bubbles: true, cancelable: true });
    form.dispatchEvent(submitEvent);
    expect(submitEvent.defaultPrevented).toBe(true);
  });
});
