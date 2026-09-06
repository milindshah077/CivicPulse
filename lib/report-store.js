import { neon } from "@neondatabase/serverless";

function database() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  return neon(process.env.DATABASE_URL);
}

export async function ensureReportsTable() {
  const sql = database();
  await sql`CREATE TABLE IF NOT EXISTS issue_sub_reports (
    id BIGSERIAL PRIMARY KEY,
    issue_id TEXT NOT NULL,
    reporter_name TEXT NOT NULL,
    report_text TEXT NOT NULL,
    location TEXT NOT NULL DEFAULT '',
    evidence_count INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL CHECK (source IN ('web', 'whatsapp')),
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS issue_sub_reports_issue_id_idx ON issue_sub_reports (issue_id, submitted_at DESC)`;
  return sql;
}

export async function addSubReport(report) {
  const sql = await ensureReportsTable();
  const [row] = await sql`
    INSERT INTO issue_sub_reports (issue_id, reporter_name, report_text, location, evidence_count, source)
    VALUES (${report.issueId}, ${report.reporterName}, ${report.text}, ${report.location || ""}, ${report.evidenceCount || 0}, ${report.source})
    RETURNING id, issue_id, reporter_name, report_text, location, evidence_count, source, submitted_at
  `;
  return row;
}

export async function getSubReports(issueId) {
  const sql = await ensureReportsTable();
  return sql`
    SELECT id, issue_id, reporter_name, report_text, location, evidence_count, source, submitted_at
    FROM issue_sub_reports
    WHERE issue_id = ${issueId}
    ORDER BY submitted_at DESC
  `;
}
