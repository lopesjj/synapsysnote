import { requireWorkspaceEditor } from "@/lib/api/session";
import { jsonError } from "@/lib/api/errors";
import {
  exportDocumentHtml,
  exportDocumentTabHtml,
  listDocumentTabs,
  type GoogleDocTab,
} from "@/lib/google/docs";

export const runtime = "nodejs";

const MAX_TABS = 30;

interface TabPayload {
  id: string;
  title: string;
  html: string;
  children: TabPayload[];
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      workspaceId?: string;
      documentId?: string;
    };
    if (!body.workspaceId || !body.documentId) {
      return Response.json({ error: "workspaceId e documentId são obrigatórios" }, { status: 400 });
    }

    await requireWorkspaceEditor(request, body.workspaceId);

    const workspaceId = body.workspaceId;
    const rawId = body.documentId;

    const colonIndex = rawId.indexOf(":");
    if (colonIndex !== -1) {
      const documentId = rawId.slice(0, colonIndex);
      const tabId = rawId.slice(colonIndex + 1);
      const html = await exportDocumentTabHtml(workspaceId, documentId, tabId);
      return Response.json({ html: html ?? "", tabs: [], tabsError: null });
    }

    const documentId = rawId;
    const { tabs, error: tabsError } = await listDocumentTabs(workspaceId, documentId);

    if (tabs.length > 1) {
      let budget = MAX_TABS;
      let complete = true;

      const expand = async (list: GoogleDocTab[]): Promise<TabPayload[]> => {
        const out: TabPayload[] = [];
        for (const tab of list) {
          if (budget <= 0) {
            complete = false;
            break;
          }
          budget -= 1;
          const html = await exportDocumentTabHtml(workspaceId, documentId, tab.id);
          if (html === null) {
            complete = false;
            break;
          }
          out.push({
            id: tab.id,
            title: tab.title,
            html,
            children: await expand(tab.children),
          });
        }
        return out;
      };

      const expanded = await expand(tabs);
      if (complete && expanded.length) {
        return Response.json({ html: "", tabs: expanded, tabsError: null });
      }

      const html = await exportDocumentHtml(workspaceId, documentId);
      return Response.json({ html, tabs: [], tabsError: "tab_export_failed" });
    }

    const html = await exportDocumentHtml(workspaceId, documentId);
    return Response.json({ html, tabs: [], tabsError });
  } catch (error) {
    return jsonError(error);
  }
}
