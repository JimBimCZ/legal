"use client";

import { useState, type Dispatch, type SetStateAction } from "react";

import { sendDocumentMessage } from "@/lib/savedDocumentsApi";
import type { ChatMessage, DocumentFields } from "@/types/document";

interface DocumentChatProps {
  savedDocumentId: number;
  initialMessages: ChatMessage[];
  currentDocumentTypeId: string;
  onFieldsChange: Dispatch<SetStateAction<DocumentFields>>;
  onDocumentTypeChanged: (documentTypeId: string, documentTypeName: string) => void;
}

const inputClassName =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

const sendButtonClassName =
  "inline-flex items-center justify-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-300 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300 dark:disabled:bg-zinc-700";

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
    <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div role="log" aria-live="polite" className="flex max-h-96 flex-col gap-3 overflow-y-auto">
        {messages.map((message, index) => (
          <div
            key={index}
            className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
              message.role === "assistant"
                ? "self-start bg-zinc-100 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100"
                : "self-end bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
            }`}
          >
            {message.content}
          </div>
        ))}
        {isLoading && (
          <div className="self-start rounded-lg bg-zinc-100 px-3 py-2 text-sm text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
            Thinking…
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center justify-between gap-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          <span>{error}</span>
          <button
            type="button"
            onClick={handleRetry}
            className="shrink-0 font-medium underline underline-offset-2"
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
          className={inputClassName}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={isLoading || !input.trim()}
          className={sendButtonClassName}
        >
          Send
        </button>
      </div>
    </div>
  );
}
