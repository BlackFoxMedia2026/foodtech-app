import type { StaffRole } from "@prisma/client";
import type { Ability } from "@/lib/tenant";

export type AgentPageContext = {
  route?: string;
  roomId?: string;
  roomName?: string;
  date?: string;
  service?: string;
};

export type AgentContext = {
  venueId: string;
  venueName: string;
  role: StaffRole;
  userId: string;
  page?: AgentPageContext;
};

export type StructuredResult =
  | { type: "metric"; label: string; value: string; hint?: string }
  | { type: "list"; title: string; items: { title: string; subtitle?: string }[] }
  | { type: "guest"; name: string; visits?: number; lastVisit?: string }
  | { type: "navigate"; path: string; label: string }
  | { type: "action_confirmation"; actionId: string; summary: string; params: Record<string, unknown> };

export type ToolResult = { text: string; structured?: StructuredResult };

export type Tool = {
  /** Ability required beyond plain venue membership, or null if none. */
  ability: Ability | null;
  run: (ctx: AgentContext, params: Record<string, string>) => Promise<ToolResult>;
};
