import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { DocumentChat } from "@/components/DocumentChat";
import type { DocumentFields } from "@/types/document";

const { sendChatMessage } = vi.hoisted(() => ({ sendChatMessage: vi.fn() }));

vi.mock("@/lib/chatApi", () => ({ sendChatMessage }));

beforeEach(() => {
  sendChatMessage.mockReset();
});

/** Mirrors how the real Home page wires state, so selection/field updates accumulate like they would for a user. */
function StatefulChat({
  initialSelectedDocument = null,
  initialSelectedDocumentName = null,
  initialFields = {},
  onDocumentSelected = () => {},
}: {
  initialSelectedDocument?: string | null;
  initialSelectedDocumentName?: string | null;
  initialFields?: DocumentFields;
  onDocumentSelected?: (id: string, name: string) => void;
}) {
  const [selectedDocument, setSelectedDocument] = useState(initialSelectedDocument);
  const [selectedDocumentName, setSelectedDocumentName] = useState(initialSelectedDocumentName);
  const [fields, setFields] = useState<DocumentFields>(initialFields);
  return (
    <>
      <DocumentChat
        selectedDocument={selectedDocument}
        selectedDocumentName={selectedDocumentName}
        fields={fields}
        onFieldsChange={setFields}
        onDocumentSelected={(id, name) => {
          setSelectedDocument(id);
          setSelectedDocumentName(name);
          onDocumentSelected(id, name);
        }}
      />
      <button
        type="button"
        onClick={() => setFields((current) => ({ ...current, other: "Manually Edited" }))}
      >
        Simulate manual edit
      </button>
      <div data-testid="selected-document">{selectedDocument ?? ""}</div>
      <div data-testid="fields-snapshot">{JSON.stringify(fields)}</div>
    </>
  );
}

function snapshotFields(): DocumentFields {
  return JSON.parse(screen.getByTestId("fields-snapshot").textContent!);
}

describe("DocumentChat", () => {
  it("shows a static greeting on load without calling the API", () => {
    render(<StatefulChat />);
    expect(screen.getByText(/what kind of legal document/)).toBeInTheDocument();
    expect(sendChatMessage).not.toHaveBeenCalled();
  });

  it("sends the current selectedDocument and fields along with the message", async () => {
    const user = userEvent.setup();
    sendChatMessage.mockResolvedValue({
      reply: "Got it.",
      selectedDocument: null,
      selectedDocumentName: null,
      fields: {},
    });

    render(<StatefulChat />);
    await user.type(screen.getByLabelText("Message"), "I need an NDA{enter}");

    expect(sendChatMessage).toHaveBeenCalledWith(
      expect.arrayContaining([{ role: "user", content: "I need an NDA" }]),
      null,
      {},
    );
  });

  it("selects a document and notifies the parent when the model resolves one", async () => {
    const user = userEvent.setup();
    const onDocumentSelected = vi.fn();
    sendChatMessage.mockResolvedValue({
      reply: "A Mutual NDA it is!",
      selectedDocument: "Mutual-NDA.md",
      selectedDocumentName: "Mutual Non-Disclosure Agreement",
      fields: {},
    });

    render(<StatefulChat onDocumentSelected={onDocumentSelected} />);
    await user.type(screen.getByLabelText("Message"), "I need an NDA{enter}");

    expect(await screen.findByText("A Mutual NDA it is!")).toBeInTheDocument();
    expect(onDocumentSelected).toHaveBeenCalledWith(
      "Mutual-NDA.md",
      "Mutual Non-Disclosure Agreement",
    );
    expect(screen.getByTestId("selected-document")).toHaveTextContent("Mutual-NDA.md");
  });

  it("shows a document-specific greeting when a document is already selected", () => {
    render(
      <StatefulChat
        initialSelectedDocument="Mutual-NDA.md"
        initialSelectedDocumentName="Mutual Non-Disclosure Agreement"
      />,
    );
    expect(
      screen.getByText(/let's fill in your Mutual Non-Disclosure Agreement/),
    ).toBeInTheDocument();
    expect(sendChatMessage).not.toHaveBeenCalled();
  });

  it("leaves the document unselected when the model is still clarifying", async () => {
    const user = userEvent.setup();
    const onDocumentSelected = vi.fn();
    sendChatMessage.mockResolvedValue({
      reply: "What kind of agreement do you need?",
      selectedDocument: null,
      selectedDocumentName: null,
      fields: {},
    });

    render(<StatefulChat onDocumentSelected={onDocumentSelected} />);
    await user.type(screen.getByLabelText("Message"), "I need a document{enter}");

    await screen.findByText("What kind of agreement do you need?");
    expect(onDocumentSelected).not.toHaveBeenCalled();
    expect(screen.getByTestId("selected-document")).toHaveTextContent("");
  });

  it("merges the AI's changed fields onto the latest state for the same document", async () => {
    const user = userEvent.setup();
    sendChatMessage.mockResolvedValue({
      reply: "Got it, who's the second party?",
      selectedDocument: "Mutual-NDA.md",
      selectedDocumentName: "Mutual Non-Disclosure Agreement",
      fields: { party1Name: "Acme Inc." },
    });

    render(<StatefulChat initialSelectedDocument="Mutual-NDA.md" initialFields={{}} />);
    await user.type(screen.getByLabelText("Message"), "The first party is Acme Inc.{enter}");

    await screen.findByText("Got it, who's the second party?");
    expect(snapshotFields().party1Name).toBe("Acme Inc.");
  });

  it("preserves a manual edit made while the request is in flight", async () => {
    const user = userEvent.setup();
    let resolveRequest!: (value: unknown) => void;
    sendChatMessage.mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );

    render(<StatefulChat initialSelectedDocument="Mutual-NDA.md" initialFields={{}} />);
    await user.type(screen.getByLabelText("Message"), "The first party is Acme Inc.{enter}");

    await user.click(screen.getByRole("button", { name: "Simulate manual edit" }));
    expect(snapshotFields().other).toBe("Manually Edited");

    resolveRequest({
      reply: "Got it",
      selectedDocument: "Mutual-NDA.md",
      selectedDocumentName: "Mutual Non-Disclosure Agreement",
      fields: { party1Name: "Acme Inc." },
    });
    await screen.findByText("Got it");

    const fields = snapshotFields();
    expect(fields.party1Name).toBe("Acme Inc.");
    expect(fields.other).toBe("Manually Edited");
  });

  it("resets fields and re-selects when the conversation switches to a different document", async () => {
    const user = userEvent.setup();
    const onDocumentSelected = vi.fn();
    sendChatMessage.mockResolvedValue({
      reply: "Switching you to a Data Processing Agreement.",
      selectedDocument: "DPA.md",
      selectedDocumentName: "Data Processing Agreement",
      // Backend always returns {} on a switch turn (stale-schema fields aren't trustworthy),
      // but the frontend shouldn't rely on that alone - it should reset regardless.
      fields: {},
    });

    render(
      <StatefulChat
        initialSelectedDocument="CSA.md"
        initialFields={{ customer: "Acme Inc." }}
        onDocumentSelected={onDocumentSelected}
      />,
    );
    await user.type(screen.getByLabelText("Message"), "Actually, I need a DPA instead.{enter}");

    await screen.findByText("Switching you to a Data Processing Agreement.");
    expect(onDocumentSelected).toHaveBeenCalledWith("DPA.md", "Data Processing Agreement");
    expect(screen.getByTestId("selected-document")).toHaveTextContent("DPA.md");
    expect(snapshotFields()).toEqual({});
  });

  it("clears the input after sending", async () => {
    const user = userEvent.setup();
    sendChatMessage.mockResolvedValue({
      reply: "Thanks!",
      selectedDocument: null,
      selectedDocumentName: null,
      fields: {},
    });

    render(<StatefulChat />);
    const input = screen.getByLabelText("Message");
    await user.type(input, "Hello{enter}");

    expect(input).toHaveValue("");
  });

  it("does not send an empty or whitespace-only message", async () => {
    const user = userEvent.setup();
    render(<StatefulChat />);

    await user.type(screen.getByLabelText("Message"), "   {enter}");

    expect(sendChatMessage).not.toHaveBeenCalled();
  });

  it("shows an error with a retry option when the request fails, and retry resends it", async () => {
    const user = userEvent.setup();
    sendChatMessage
      .mockRejectedValueOnce(new Error("Failed to reach the AI assistant. Please try again."))
      .mockResolvedValueOnce({
        reply: "Welcome back",
        selectedDocument: null,
        selectedDocumentName: null,
        fields: {},
      });

    render(<StatefulChat />);
    await user.type(screen.getByLabelText("Message"), "Hello{enter}");

    expect(
      await screen.findByText("Failed to reach the AI assistant. Please try again."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("Welcome back")).toBeInTheDocument();
    expect(sendChatMessage).toHaveBeenCalledTimes(2);
  });

  it("disables the send button while a request is in flight", async () => {
    const user = userEvent.setup();
    let resolveRequest!: (value: unknown) => void;
    sendChatMessage.mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );

    render(<StatefulChat />);
    await user.type(screen.getByLabelText("Message"), "Hello{enter}");

    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    expect(screen.getByText("Thinking…")).toBeInTheDocument();

    resolveRequest({ reply: "Done", selectedDocument: null, selectedDocumentName: null, fields: {} });
    expect(await screen.findByText("Done")).toBeInTheDocument();
  });
});
