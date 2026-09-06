import { addSubReport, getAllReportMetrics, getReportMetrics, getSubReports, updateSubReportFollowing } from "../lib/report-store.js";

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
        if (!issueId) return json({ metrics: await getAllReportMetrics() });
        const [reports, metrics] = await Promise.all([getSubReports(issueId), getReportMetrics(issueId)]);
        return json({ reports, metrics });
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
          isFollowing: body.isFollowing !== false,
          source,
        });
        return json({ report, metrics: await getReportMetrics(issueId) }, 201);
      }

      if (request.method === "PATCH") {
        const body = await request.json();
        const reportId = Number.parseInt(body.reportId, 10);
        if (!Number.isSafeInteger(reportId) || typeof body.isFollowing !== "boolean") {
          return json({ error: "reportId and isFollowing are required" }, 400);
        }
        const report = await updateSubReportFollowing(reportId, body.isFollowing);
        if (!report) return json({ error: "Report not found" }, 404);
        return json({ report, metrics: await getReportMetrics(report.issue_id) });
      }

      return json({ error: "Method not allowed" }, 405);
    } catch (error) {
      console.error("Reports API error", error);
      return json({ error: "Report storage is temporarily unavailable" }, 500);
    }
  },
};
