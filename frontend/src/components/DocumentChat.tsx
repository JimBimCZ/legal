"use client";

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

import { sendDocumentMessage } from "@/lib/savedDocumentsApi";
import type { ChatMessage, DocumentFields } from "@/types/document";

interface DocumentChatProps {
  savedDocumentId: number;
  initialMessages: ChatMessage[];
  currentDocumentTypeId: string;
  onFieldsChange: Dispatch<SetStateAction<DocumentFields>>;
  onDocumentTypeChanged: (documentTypeId: string, documentTypeName: string) => void;
}

const bubbleClassName = "max-w-[85%] px-4 py-2.5 text-sm leading-relaxed";

export function DocumentChat({
  savedDocumentId,
  initialMessages,
  currentDocumentTypeId,
  onFieldsChange,
  onDocumentTypeChanged,
}: DocumentChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The content of the turn currently in flight (or last failed), so Retry
  // can resend it without re-appending a duplicate user bubble - the server
  // only persists a turn once the AI call succeeds, so a failed attempt
  // never left anything behind to duplicate.
  const [pendingContent, setPendingContent] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [messages, isLoading]);

  async function sendTurn(content: string) {
    setIsLoading(true);
    setError(null);
    setPendingContent(content);
    try {
      const result = await sendDocumentMessage(savedDocumentId, content);
      setMessages((current) => [...current, { role: "assistant", content: result.reply }]);
      onFieldsChange(result.fields);
      if (result.selectedDocument !== currentDocumentTypeId) {
        onDocumentTypeChanged(result.selectedDocument, result.selectedDocumentName);
      }
      setPendingContent(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setIsLoading(false);
    }
  }

  function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    setMessages((current) => [...current, { role: "user", content: trimmed }]);
    setInput("");
    void sendTurn(trimmed);
  }

  function handleRetry() {
    if (pendingContent) void sendTurn(pendingContent);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="groove-panel flex flex-col gap-4 p-5">
      <div
        ref={logRef}
        role="log"
        aria-live="polite"
        className="-mr-2 flex max-h-96 min-h-64 flex-col gap-3 overflow-y-auto pr-2"
      >
        {messages.map((message, index) => (
          <div
            key={index}
            className={`${bubbleClassName} ${
              message.role === "assistant"
                ? "self-start rounded-lg rounded-bl-sm border border-line bg-canvas text-ink"
                : "self-end rounded-lg rounded-br-sm bg-action text-on-action"
            }`}
          >
            {message.content}
          </div>
        ))}
        {isLoading && (
          <div
            className={`${bubbleClassName} flex items-center gap-2 self-start rounded-lg rounded-bl-sm border border-line bg-canvas text-ink-muted`}
          >
            <span className="groove-eyebrow">Thinking…</span>
            <span aria-hidden="true" className="flex items-center gap-1">
              <span className="groove-dot" />
              <span className="groove-dot" />
              <span className="groove-dot" />
            </span>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-ember bg-ember/5 px-3.5 py-2.5 text-sm font-medium text-ember-ink">
          <span>{error}</span>
          <button
            type="button"
            onClick={handleRetry}
            className="groove-link shrink-0 underline underline-offset-4 hover:text-ink"
          >
            Retry
          </button>
        </div>
      )}

      <div className="flex gap-2">
        <label htmlFor="document-chat-input" className="sr-only">
          Message
        </label>
        <input
          id="document-chat-input"
          type="text"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type your answer…"
          disabled={isLoading}
          className="groove-input"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={isLoading || !input.trim()}
          className="groove-btn groove-btn-primary"
        >
          Send
        </button>
      </div>
    </div>
  );
}
