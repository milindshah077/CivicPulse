import { addSubReport, getSubReports } from "../lib/report-store.js";

const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
});

export default {
  async fetch(request) {
    try {
      const url = new URL(request.url);
      if (request.method === "GET") {
        const issueId = url.searchParams.get("issueId")?.trim();
        if (!issueId) return json({ error: "issueId is required" }, 400);
        return json({ reports: await getSubReports(issueId) });
      }

      if (request.method === "POST") {
        const body = await request.json();
        const issueId = String(body.issueId || "").trim();
        const text = String(body.text || "").trim();
        const source = body.source === "whatsapp" ? "whatsapp" : "web";
        if (!issueId || !text) return json({ error: "issueId and text are required" }, 400);
        const reporterName = String(body.reporterName || "").trim()
          || (source === "web" ? `user_${Date.now()}` : "WhatsApp user");
        const report = await addSubReport({
          issueId,
          reporterName,
          text,
          location: String(body.location || "").trim(),
          evidenceCount: Math.max(0, Number.parseInt(body.evidenceCount, 10) || 0),
          source,
        });
        return json({ report }, 201);
      }

      return json({ error: "Method not allowed" }, 405);
    } catch (error) {
      console.error("Reports API error", error);
      return json({ error: "Report storage is temporarily unavailable" }, 500);
    }
  },
};
