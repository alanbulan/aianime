// Copyright (c) 2026 AI anime
export type ClientFrame =
  | {
      type: "chat.message";
      scope?: ChatScope;
      text: string;
      turn_id?: string;
      attachments?: ChatAttachment[];
    }
  | { type: "scope.set"; scope: ChatScope }
  | { type: "session.model.get"; scope: ChatScope }
  | {
      type: "session.model.set";
      scope: ChatScope;
      selector: string | null;
      reasoning_effort?: string | null;
    }
  | {
      type: "conversation.delete";
      scope: ChatScope;
      conversationId: string;
    };

export type ChatScope = {
  kind: "home" | "project";
  id?: string | null;
  conversationId?: string;
};

export type ChatConversation = {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
};

export type RelayInstanceInfo = {
  instanceId: string;
  instanceName: string;
  ip?: string;
  connectedAt?: number;
  busy?: boolean;
};

export type ModelEntry = {
  id: string;
  label: string;
  description?: string;
  modelId?: string;
  providerLabel?: string;
  source?: "auto" | "cloud" | "byok";
  reasoning?: boolean;
  contextWindow?: number;
  maxOutputTokens?: number;
  reasoningEfforts?: string[];
  defaultReasoningEffort?: string;
};

export type ChatToolEntry = {
  name: string;
  label: string;
  description: string;
  category: string;
  source: string;
};

export type ChatSlashCommand = {
  name: string;
  description: string;
  inputHint?: string;
  kind?: "command" | "skill";
  source?: "managed" | "user";
  tools?: ChatToolEntry[];
};

export type StructuredSlashCommandName =
  | "compact"
  | "context"
  | "reset"
  | "version";

export type ChatSlashCommandResult = {
  command: StructuredSlashCommandName;
  text: string;
  usage?: {
    used: number;
    size: number;
  };
};

export type MessageContextState = "normal" | "pinned" | "excluded";

export type SessionControlCommand =
  | "agents"
  | "compact"
  | "fast"
  | "kill"
  | "model"
  | "redirect"
  | "steer"
  | "think"
  | "usage"
  | "verbose";

export type DecisionOption = {
  id: string;
  label: string;
  description: string;
};

export type DecisionQuestion = {
  id: string;
  header: string;
  question: string;
  options: DecisionOption[];
  recommended_option_id?: string | null;
  allow_custom?: boolean;
};

export type DecisionRequest = {
  id: string;
  title: string;
  source: string;
  status: "pending";
  turn_id?: string;
  scope?: ChatScope;
  questions: DecisionQuestion[];
  created_at?: string;
};

export type DecisionAnswer = {
  question_id: string;
  option_id?: string | null;
  custom_text?: string | null;
};

export type ServerFrame =
  | {
      type: "scope.changed";
      scope: ChatScope;
      history: unknown[];
      conversations?: ChatConversation[];
      decisions?: unknown[];
      busy?: boolean;
      commands?: unknown;
    }
  | {
      type: "commands.available";
      commands?: unknown;
    }
  | {
      type: "session.model.state";
      scope?: ChatScope;
      selector?: string | null;
      reasoning_effort?: string | null;
      error?: string;
    }
  | {
      type: "decision_required";
      turn_id?: string;
      scope?: ChatScope;
      decision?: unknown;
    }
  | {
      type: "decision_resolved";
      turn_id?: string;
      scope?: ChatScope;
      decision_id?: string;
      status?: "resolved" | "cancelled";
      answers?: unknown[];
    }
  | {
      type: "chat.busy";
      scope?: ChatScope;
      turn_id?: string;
      message?: string;
    }
  | {
      type: "conversation.deleted";
      conversationId: string;
      conversations?: ChatConversation[];
    }
  | {
      type: "chat.ping";
      scope?: ChatScope;
      turn_id?: string;
    }
  | {
      type: "thread.started";
      scope?: ChatScope;
      thread_id?: string | null;
      turn_id?: string;
    }
  | {
      type: "assistant.delta";
      text?: string;
      turn_id?: string;
      accumulated?: boolean;
    }
  | {
      type: "assistant.message";
      message?: unknown;
      turn_id?: string;
    }
  | {
      type: "tool.result";
      turn_id?: string;
      tool_call_id?: string | null;
      name?: string;
      success?: boolean;
      result?: unknown;
      error?: unknown;
      raw?: unknown;
    }
  | {
      type: "tool.call";
      turn_id?: string;
      tool_call_id?: string | null;
      name?: string;
      input?: unknown;
      raw?: unknown;
    }
  | { type: "chat.done"; turn_id?: string; scope?: ChatScope }
  | { type: "project.created"; project: string }
  | { type: "error"; message: string; turn_id?: string }
  | { type: string; [key: string]: unknown };

export type ChatRole = "user" | "assistant" | "system" | "tool";

export type ChatAttachment = {
  id?: string;
  type?: string;
  kind?: string;
  mimeType?: string;
  fileName?: string;
  fileSize?: number;
  content?: string;
  url?: string;
  path?: string;
  label?: string;
};

export type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  turnId?: string;
  displayName?: string;
  attachments?: ChatAttachment[];
  toolCallId?: string;
  toolName?: string;
  toolState?: "running" | "pending" | "success" | "error";
  toolInput?: unknown;
  toolOutput?: unknown;
  toolError?: unknown;
  contextState?: MessageContextState;
  timestamp: number;
  raw?: unknown;
};

export type ApprovalRequest = {
  id: string;
  kind: "exec" | "plugin";
  title: string;
  command?: string;
  description?: string;
  cwd?: string | null;
  host?: string | null;
  security?: string | null;
  agentId?: string | null;
  sessionKey?: string | null;
  expiresAtMs?: number;
};

export type SuperChatSettings = {
  showToolEvents: boolean;
  showStructuredSourceWhileStreaming: boolean;
};
