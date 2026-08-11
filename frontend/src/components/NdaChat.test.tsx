import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { NdaChat } from "@/components/NdaChat";
import { EMPTY_NDA_FIELDS, type MutualNdaFields } from "@/types/nda";

const { sendChatMessage } = vi.hoisted(() => ({ sendChatMessage: vi.fn() }));

vi.mock("@/lib/chatApi", () => ({ sendChatMessage }));

beforeEach(() => {
  sendChatMessage.mockReset();
});

/** Mirrors how the real Home page wires state, so field updates accumulate like they would for a user. */
function StatefulNdaChat() {
  const [fields, setFields] = useState(EMPTY_NDA_FIELDS);
  return (
    <>
      <NdaChat fields={fields} onFieldsChange={setFields} />
      <button
        type="button"
        onClick={() => setFields((current) => ({ ...current, party2Name: "Manually Edited Co" }))}
      >
        Simulate manual edit
      </button>
      <div data-testid="fields-snapshot">{JSON.stringify(fields)}</div>
    </>
  );
}

function snapshotFields(): MutualNdaFields {
  return JSON.parse(screen.getByTestId("fields-snapshot").textContent!);
}

describe("NdaChat", () => {
  it("shows a static greeting on load without calling the API", () => {
    render(<NdaChat fields={EMPTY_NDA_FIELDS} onFieldsChange={vi.fn()} />);
    expect(screen.getByText(/I'll help you put together your Mutual NDA/)).toBeInTheDocument();
    expect(sendChatMessage).not.toHaveBeenCalled();
  });

  it("sends the typed message, current fields, and shows the assistant's reply", async () => {
    const user = userEvent.setup();
    sendChatMessage.mockResolvedValue({
      reply: "Got it, who's the second party?",
      fields: { ...EMPTY_NDA_FIELDS, party1Name: "Acme Inc." },
    });

    render(<StatefulNdaChat />);
    await user.type(screen.getByLabelText("Message"), "The first party is Acme Inc.{enter}");

    expect(await screen.findByText("Got it, who's the second party?")).toBeInTheDocument();
    expect(screen.getByText("The first party is Acme Inc.")).toBeInTheDocument();
    expect(sendChatMessage).toHaveBeenCalledWith(
      [
        {
          role: "assistant",
          content:
            "Hi! I'll help you put together your Mutual NDA. Let's start with the parties — what are the names and addresses of the two companies involved?",
        },
        { role: "user", content: "The first party is Acme Inc." },
      ],
      EMPTY_NDA_FIELDS,
    );
    expect(snapshotFields().party1Name).toBe("Acme Inc.");
  });

  it("merges the AI's changed fields onto the latest state instead of overwriting a manual edit made while the request was in flight", async () => {
    const user = userEvent.setup();
    let resolveRequest!: (value: { reply: string; fields: MutualNdaFields }) => void;
    sendChatMessage.mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );

    render(<StatefulNdaChat />);
    await user.type(screen.getByLabelText("Message"), "The first party is Acme Inc.{enter}");

    // A manual edit (e.g. in the side form panel) happens elsewhere on the
    // page while the AI's response is still in flight.
    await user.click(screen.getByRole("button", { name: "Simulate manual edit" }));
    expect(snapshotFields().party2Name).toBe("Manually Edited Co");

    resolveRequest({
      reply: "Got it",
      fields: { ...EMPTY_NDA_FIELDS, party1Name: "Acme Inc." },
    });
    await screen.findByText("Got it");

    const fields = snapshotFields();
    expect(fields.party1Name).toBe("Acme Inc.");
    expect(fields.party2Name).toBe("Manually Edited Co");
  });

  it("clears the input after sending", async () => {
    const user = userEvent.setup();
    sendChatMessage.mockResolvedValue({ reply: "Thanks!", fields: EMPTY_NDA_FIELDS });

    render(<NdaChat fields={EMPTY_NDA_FIELDS} onFieldsChange={vi.fn()} />);
    const input = screen.getByLabelText("Message");
    await user.type(input, "Hello{enter}");

    expect(input).toHaveValue("");
  });

  it("does not send an empty or whitespace-only message", async () => {
    const user = userEvent.setup();
    render(<NdaChat fields={EMPTY_NDA_FIELDS} onFieldsChange={vi.fn()} />);

    await user.type(screen.getByLabelText("Message"), "   {enter}");

    expect(sendChatMessage).not.toHaveBeenCalled();
  });

  it("shows an error with a retry option when the request fails, and retry resends it", async () => {
    const user = userEvent.setup();
    sendChatMessage
      .mockRejectedValueOnce(new Error("Failed to reach the AI assistant. Please try again."))
      .mockResolvedValueOnce({ reply: "Welcome back", fields: EMPTY_NDA_FIELDS });

    render(<NdaChat fields={EMPTY_NDA_FIELDS} onFieldsChange={vi.fn()} />);
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
    let resolveRequest!: (value: { reply: string; fields: typeof EMPTY_NDA_FIELDS }) => void;
    sendChatMessage.mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );

    render(<NdaChat fields={EMPTY_NDA_FIELDS} onFieldsChange={vi.fn()} />);
    await user.type(screen.getByLabelText("Message"), "Hello{enter}");

    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    expect(screen.getByText("Thinking…")).toBeInTheDocument();

    resolveRequest({ reply: "Done", fields: EMPTY_NDA_FIELDS });
    expect(await screen.findByText("Done")).toBeInTheDocument();
  });
});
