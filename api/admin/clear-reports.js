import { timingSafeEqual } from "node:crypto";
import { clearSubReports } from "../../lib/report-store.js";

const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
});

function validSecret(request) {
  const expected = process.env.CLEAR_REPORTS_SECRET;
  const supplied = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!expected || !supplied) return false;
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}

export default {
  async fetch(request) {
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
    if (!process.env.CLEAR_REPORTS_SECRET) return json({ error: "Clear webhook is not configured" }, 503);
    if (!validSecret(request)) return json({ error: "Unauthorized" }, 401);

    try {
      const body = await request.json();
      if (body.confirmation !== "CLEAR_ALL_REPORTS") {
        return json({ error: "confirmation must be CLEAR_ALL_REPORTS" }, 400);
      }
      const deletedReports = await clearSubReports();
      return json({ success: true, deletedReports });
    } catch (error) {
      console.error("Clear reports webhook error", error);
      return json({ error: "Unable to clear reports" }, 500);
    }
  },
};
