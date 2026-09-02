"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Sheet, SheetTrigger } from "@/components/ui/sheet";
import { AgentButton } from "./agent-button";
import { AgentDrawer } from "./agent-drawer";
import { AgentChat } from "./agent-chat";
import type { SerializedMessage, AgentTurnEvent } from "@/server/ai/agent-service";

function usePageContext() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return {
    route: pathname,
    roomId: searchParams.get("room") ?? undefined,
    date: searchParams.get("date") ?? undefined,
    service: searchParams.get("service") ?? undefined,
  };
}

export function Agent() {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SerializedMessage[]>([]);
  const [usage, setUsage] = useState<{ used: number; limit: number } | null>(null);
  const [sending, setSending] = useState(false);
  const [pendingNewConversation, setPendingNewConversation] = useState(false);
  const [actedMessageIds, setActedMessageIds] = useState<Set<string>>(new Set());
  const [confirmingMessageId, setConfirmingMessageId] = useState<string | null>(null);

  const page = usePageContext();
  const pageRef = useRef(page);
  pageRef.current = page;

  useEffect(() => {
    if (!open || loaded) return;
    setLoaded(true);
    fetch("/api/agent/messages")
      .then((r) => r.json())
      .then((data) => {
        setConversationId(data.conversationId);
        setMessages(data.messages);
        setUsage(data.usage);
      })
      .catch(() => {});
  }, [open, loaded]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (sending) return;
      setSending(true);

      const optimisticUser: SerializedMessage = {
        id: `pending-${Date.now()}`,
        role: "USER",
        content: text,
        structured: null,
        source: null,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimisticUser]);

      const streamingId = `streaming-${Date.now()}`;
      let streamingText = "";
      let streamingStarted = false;

      try {
        const res = await fetch("/api/agent/messages", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            text,
            conversationId: conversationId ?? undefined,
            newConversation: pendingNewConversation || undefined,
            page: pageRef.current,
          }),
        });
        setPendingNewConversation(false);

        if (!res.body) throw new Error("no_stream");
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.trim()) continue;
            const event = JSON.parse(line) as AgentTurnEvent;
            if (event.type === "chunk") {
              streamingText += event.text;
              if (!streamingStarted) {
                streamingStarted = true;
                setMessages((prev) => [
                  ...prev,
                  {
                    id: streamingId,
                    role: "ASSISTANT",
                    content: streamingText,
                    structured: null,
                    source: "external",
                    createdAt: new Date().toISOString(),
                  },
                ]);
              } else {
                setMessages((prev) => prev.map((m) => (m.id === streamingId ? { ...m, content: streamingText } : m)));
              }
            } else if (event.type === "done") {
              setMessages((prev) => {
                const withoutStreaming = prev.filter((m) => m.id !== streamingId);
                return event.message ? [...withoutStreaming, event.message] : withoutStreaming;
              });
              if (event.usage) setUsage(event.usage);
            }
          }
        }
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: `error-${Date.now()}`,
            role: "ASSISTANT",
            content: "Si è verificato un errore di comunicazione. Riprova.",
            structured: null,
            source: "internal",
            createdAt: new Date().toISOString(),
          },
        ]);
      } finally {
        setSending(false);
      }
    },
    [conversationId, pendingNewConversation, sending],
  );

  const handleNewConversation = useCallback(() => {
    setMessages([]);
    setConversationId(null);
    setPendingNewConversation(true);
    setActedMessageIds(new Set());
  }, []);

  const handleConfirmAction = useCallback(
    async (messageId: string, actionId: string, params: Record<string, unknown>) => {
      if (!conversationId) return;
      setConfirmingMessageId(messageId);
      try {
        const res = await fetch("/api/agent/actions/confirm", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ conversationId, actionId, params }),
        });
        const data = await res.json();
        setActedMessageIds((prev) => new Set(prev).add(messageId));
        if (data.message) setMessages((prev) => [...prev, data.message]);
      } catch {
        // Leave the confirmation UI in place so the user can retry.
      } finally {
        setConfirmingMessageId(null);
      }
    },
    [conversationId],
  );

  const handleCancelAction = useCallback((messageId: string) => {
    setActedMessageIds((prev) => new Set(prev).add(messageId));
  }, []);

  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (!next) {
      // modal={false} means Radix doesn't auto-restore focus to the
      // trigger on close (that convenience is tied to its focus-trap
      // machinery, which non-modal dialogs intentionally skip) — restore
      // it ourselves once the close transition has settled.
      requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }, []);

  return (
    <Sheet open={open} onOpenChange={handleOpenChange} modal={false}>
      <SheetTrigger asChild>
        <AgentButton ref={triggerRef} open={open} processing={sending} />
      </SheetTrigger>
      <AgentDrawer onNewConversation={handleNewConversation}>
        <AgentChat
          messages={messages}
          sending={sending}
          usage={usage}
          actedMessageIds={actedMessageIds}
          confirmingMessageId={confirmingMessageId}
          onSend={sendMessage}
          onConfirmAction={handleConfirmAction}
          onCancelAction={handleCancelAction}
        />
      </AgentDrawer>
    </Sheet>
  );
}
