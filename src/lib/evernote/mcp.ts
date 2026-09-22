import "server-only";

import { ApiError } from "@/lib/api/errors";
import { EVERNOTE_MCP_ENDPOINT } from "./oauth";
import type { McpToolDefinition } from "./payload";

export type { McpToolDefinition };

const PROTOCOL_VERSION = "2025-06-18";

interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

interface JsonRpcResponse {
  id?: number | string;
  result?: Record<string, unknown>;
  error?: JsonRpcError;
}

export class EvernoteAuthExpired extends ApiError {
  constructor() {
    super(401, "A sessão do Evernote expirou. Conecte a conta novamente.");
  }
}

function parseSseBody(raw: string): JsonRpcResponse[] {
  const messages: JsonRpcResponse[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      messages.push(JSON.parse(payload) as JsonRpcResponse);
    } catch {}
  }
  return messages;
}

export class EvernoteMcpClient {
  private sessionId: string | null = null;
  private tools: McpToolDefinition[] | null = null;
  private requestId = 0;

  constructor(private readonly accessToken: string) {}

  private async send(
    method: string,
    params?: Record<string, unknown>,
    notification = false
  ): Promise<Record<string, unknown>> {
    const id = notification ? undefined : (this.requestId += 1);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${this.accessToken}`,
      "MCP-Protocol-Version": PROTOCOL_VERSION,
    };
    if (this.sessionId) headers["Mcp-Session-Id"] = this.sessionId;

    const response = await fetch(EVERNOTE_MCP_ENDPOINT, {
      method: "POST",
      headers,
      cache: "no-store",
      body: JSON.stringify({
        jsonrpc: "2.0",
        ...(id === undefined ? {} : { id }),
        method,
        ...(params ? { params } : {}),
      }),
    });

    const sessionHeader = response.headers.get("mcp-session-id");
    if (sessionHeader) this.sessionId = sessionHeader;

    if (response.status === 401 || response.status === 403) {
      throw new EvernoteAuthExpired();
    }

    if (notification || response.status === 202) {
      await response.text().catch(() => "");
      return {};
    }

    const text = await response.text();
    if (!response.ok && !text) {
      throw new ApiError(502, `Evernote respondeu ${response.status}.`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    const messages = contentType.includes("text/event-stream")
      ? parseSseBody(text)
      : (() => {
          try {
            const parsed = JSON.parse(text) as JsonRpcResponse | JsonRpcResponse[];
            return Array.isArray(parsed) ? parsed : [parsed];
          } catch {
            return [];
          }
        })();

    const match = messages.find((message) => message.id === id) ?? messages[0];
    if (!match) {
      throw new ApiError(502, `Resposta inesperada do Evernote (${response.status}).`);
    }
    if (match.error) {
      if (/unauthor|expired|invalid_token|forbidden/i.test(match.error.message)) {
        throw new EvernoteAuthExpired();
      }
      throw new ApiError(502, match.error.message || "Erro no servidor MCP do Evernote.");
    }
    return match.result ?? {};
  }

  async initialize(): Promise<void> {
    if (this.sessionId) return;
    await this.send("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "synapsys-note", version: "1.0.0" },
    });
    await this.send("notifications/initialized", undefined, true);
  }

  async listTools(): Promise<McpToolDefinition[]> {
    if (this.tools) return this.tools;
    await this.initialize();
    const result = await this.send("tools/list");
    const tools = (result.tools as McpToolDefinition[] | undefined) ?? [];
    this.tools = tools;
    return tools;
  }

  async findTool(candidates: string[]): Promise<McpToolDefinition | null> {
    const tools = await this.listTools();
    for (const name of candidates) {
      const exact = tools.find((tool) => tool.name === name);
      if (exact) return exact;
    }
    for (const name of candidates) {
      const loose = tools.find((tool) => tool.name.replace(/[-_]/g, "") === name.replace(/[-_]/g, ""));
      if (loose) return loose;
    }
    return null;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    await this.initialize();
    const result = await this.send("tools/call", { name, arguments: args });
    if (result.isError) {
      throw new ApiError(502, textFromToolResult(result) || "O Evernote recusou a chamada.");
    }
    if (result.structuredContent !== undefined) return result.structuredContent;
    const text = textFromToolResult(result);
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
}

function textFromToolResult(result: Record<string, unknown>): string {
  const content = result.content as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .filter(Boolean)
    .join("\n")
    .trim();
}
