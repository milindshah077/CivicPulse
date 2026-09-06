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
    is_following BOOLEAN NOT NULL DEFAULT TRUE,
    source TEXT NOT NULL CHECK (source IN ('web', 'whatsapp')),
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`ALTER TABLE issue_sub_reports ADD COLUMN IF NOT EXISTS is_following BOOLEAN NOT NULL DEFAULT TRUE`;
  await sql`CREATE INDEX IF NOT EXISTS issue_sub_reports_issue_id_idx ON issue_sub_reports (issue_id, submitted_at DESC)`;
  return sql;
}

export async function addSubReport(report) {
  const sql = await ensureReportsTable();
  const [row] = await sql`
    INSERT INTO issue_sub_reports (issue_id, reporter_name, report_text, location, evidence_count, is_following, source)
    VALUES (${report.issueId}, ${report.reporterName}, ${report.text}, ${report.location || ""}, ${report.evidenceCount || 0}, ${report.isFollowing !== false}, ${report.source})
    RETURNING id, issue_id, reporter_name, report_text, location, evidence_count, is_following, source, submitted_at
  `;
  return row;
}

export async function getSubReports(issueId) {
  const sql = await ensureReportsTable();
  return sql`
    SELECT id, issue_id, reporter_name, report_text, location, evidence_count, is_following, source, submitted_at
    FROM issue_sub_reports
    WHERE issue_id = ${issueId}
    ORDER BY submitted_at DESC
  `;
}

export async function getReportMetrics(issueId) {
  const sql = await ensureReportsTable();
  const [row] = await sql`
    SELECT COUNT(*)::int AS impacted,
      COALESCE(SUM(evidence_count), 0)::int AS evidences,
      COUNT(*) FILTER (WHERE is_following)::int AS following
    FROM issue_sub_reports
    WHERE issue_id = ${issueId}
  `;
  return row;
}

export async function getAllReportMetrics() {
  const sql = await ensureReportsTable();
  return sql`
    SELECT issue_id, COUNT(*)::int AS impacted,
      COALESCE(SUM(evidence_count), 0)::int AS evidences,
      COUNT(*) FILTER (WHERE is_following)::int AS following
    FROM issue_sub_reports
    GROUP BY issue_id
  `;
}

export async function updateSubReportFollowing(id, isFollowing) {
  const sql = await ensureReportsTable();
  const [row] = await sql`
    UPDATE issue_sub_reports SET is_following = ${isFollowing}
    WHERE id = ${id}
    RETURNING id, issue_id, is_following
  `;
  return row;
}

export async function clearSubReports() {
  const sql = await ensureReportsTable();
  const rows = await sql`DELETE FROM issue_sub_reports RETURNING id`;
  return rows.length;
}
