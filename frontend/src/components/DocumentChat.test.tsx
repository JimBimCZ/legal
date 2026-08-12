import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { DocumentChat } from "@/components/DocumentChat";
import type { ChatMessage, DocumentFields } from "@/types/document";

const { sendDocumentMessage } = vi.hoisted(() => ({ sendDocumentMessage: vi.fn() }));

vi.mock("@/lib/savedDocumentsApi", () => ({ sendDocumentMessage }));

beforeEach(() => {
  sendDocumentMessage.mockReset();
});

const GREETING: ChatMessage = { role: "assistant", content: "Great, let's fill in your NDA." };

/** Mirrors how the real Home page wires state, so field/type updates accumulate like they would for a user. */
function StatefulChat({
  currentDocumentTypeId = "Mutual-NDA.md",
  initialMessages = [GREETING],
  onDocumentTypeChanged = () => {},
}: {
  currentDocumentTypeId?: string;
  initialMessages?: ChatMessage[];
  onDocumentTypeChanged?: (id: string, name: string) => void;
}) {
  const [fields, setFields] = useState<DocumentFields>({});
  return (
    <>
      <DocumentChat
        savedDocumentId={42}
        initialMessages={initialMessages}
        currentDocumentTypeId={currentDocumentTypeId}
        onFieldsChange={setFields}
        onDocumentTypeChanged={onDocumentTypeChanged}
      />
      <div data-testid="fields-snapshot">{JSON.stringify(fields)}</div>
    </>
  );
}

function snapshotFields(): DocumentFields {
  return JSON.parse(screen.getByTestId("fields-snapshot").textContent!);
}

describe("DocumentChat", () => {
  it("renders the seeded initial messages without calling the API", () => {
    render(<StatefulChat />);
    expect(screen.getByText("Great, let's fill in your NDA.")).toBeInTheDocument();
    expect(sendDocumentMessage).not.toHaveBeenCalled();
  });

  it("sends the message content to the saved document's endpoint", async () => {
    const user = userEvent.setup();
    sendDocumentMessage.mockResolvedValue({
      reply: "Got it.",
      selectedDocument: "Mutual-NDA.md",
      selectedDocumentName: "Mutual Non-Disclosure Agreement",
      fields: {},
      updatedAt: "2026-01-01 00:00:00",
    });

    render(<StatefulChat />);
    await user.type(screen.getByLabelText("Message"), "I need an NDA{enter}");

    expect(sendDocumentMessage).toHaveBeenCalledWith(42, "I need an NDA");
  });

  it("appends the assistant reply and replaces the fields with the response", async () => {
    const user = userEvent.setup();
    sendDocumentMessage.mockResolvedValue({
      reply: "Got it, who's the second party?",
      selectedDocument: "Mutual-NDA.md",
      selectedDocumentName: "Mutual Non-Disclosure Agreement",
      fields: { party1Name: "Acme Inc." },
      updatedAt: "2026-01-01 00:00:00",
    });

    render(<StatefulChat />);
    await user.type(screen.getByLabelText("Message"), "The first party is Acme Inc.{enter}");

    await screen.findByText("Got it, who's the second party?");
    expect(snapshotFields()).toEqual({ party1Name: "Acme Inc." });
  });

  it("notifies the parent when the response resolves a different document type", async () => {
    const user = userEvent.setup();
    const onDocumentTypeChanged = vi.fn();
    sendDocumentMessage.mockResolvedValue({
      reply: "Switching you to a Data Processing Agreement.",
      selectedDocument: "DPA.md",
      selectedDocumentName: "Data Processing Agreement",
      fields: {},
      updatedAt: "2026-01-01 00:00:00",
    });

    render(
      <StatefulChat currentDocumentTypeId="Mutual-NDA.md" onDocumentTypeChanged={onDocumentTypeChanged} />,
    );
    await user.type(screen.getByLabelText("Message"), "Actually, I need a DPA instead.{enter}");

    await screen.findByText("Switching you to a Data Processing Agreement.");
    expect(onDocumentTypeChanged).toHaveBeenCalledWith("DPA.md", "Data Processing Agreement");
  });

  it("does not notify the parent when the resolved document type is unchanged", async () => {
    const user = userEvent.setup();
    const onDocumentTypeChanged = vi.fn();
    sendDocumentMessage.mockResolvedValue({
      reply: "Got it.",
      selectedDocument: "Mutual-NDA.md",
      selectedDocumentName: "Mutual Non-Disclosure Agreement",
      fields: {},
      updatedAt: "2026-01-01 00:00:00",
    });

    render(
      <StatefulChat currentDocumentTypeId="Mutual-NDA.md" onDocumentTypeChanged={onDocumentTypeChanged} />,
    );
    await user.type(screen.getByLabelText("Message"), "Hello{enter}");

    await screen.findByText("Got it.");
    expect(onDocumentTypeChanged).not.toHaveBeenCalled();
  });

  it("clears the input after sending", async () => {
    const user = userEvent.setup();
    sendDocumentMessage.mockResolvedValue({
      reply: "Thanks!",
      selectedDocument: "Mutual-NDA.md",
      selectedDocumentName: "Mutual Non-Disclosure Agreement",
      fields: {},
      updatedAt: "2026-01-01 00:00:00",
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

    expect(sendDocumentMessage).not.toHaveBeenCalled();
  });

  it("shows an error with a retry option when the request fails, and retry resends the same content", async () => {
    const user = userEvent.setup();
    sendDocumentMessage
      .mockRejectedValueOnce(new Error("Failed to reach the AI assistant. Please try again."))
      .mockResolvedValueOnce({
        reply: "Welcome back",
        selectedDocument: "Mutual-NDA.md",
        selectedDocumentName: "Mutual Non-Disclosure Agreement",
        fields: {},
        updatedAt: "2026-01-01 00:00:00",
      });

    render(<StatefulChat />);
    await user.type(screen.getByLabelText("Message"), "Hello{enter}");

    expect(
      await screen.findByText("Failed to reach the AI assistant. Please try again."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("Welcome back")).toBeInTheDocument();
    expect(sendDocumentMessage).toHaveBeenCalledTimes(2);
    expect(sendDocumentMessage).toHaveBeenNthCalledWith(2, 42, "Hello");
    // Only one user bubble - retry must not append a duplicate.
    expect(screen.getAllByText("Hello")).toHaveLength(1);
  });

  it("disables the send button while a request is in flight", async () => {
    const user = userEvent.setup();
    let resolveRequest!: (value: unknown) => void;
    sendDocumentMessage.mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );

    render(<StatefulChat />);
    await user.type(screen.getByLabelText("Message"), "Hello{enter}");

    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    expect(screen.getByText("Thinking…")).toBeInTheDocument();

    resolveRequest({
      reply: "Done",
      selectedDocument: "Mutual-NDA.md",
      selectedDocumentName: "Mutual Non-Disclosure Agreement",
      fields: {},
      updatedAt: "2026-01-01 00:00:00",
    });
    expect(await screen.findByText("Done")).toBeInTheDocument();
  });
});
