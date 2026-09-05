const COOKIE_NAME = "civic_pulse_flow";
const COOKIE_MAX_AGE = 4 * 60 * 60;

const normalize = (value = "") =>
  value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

function matchIssue(description, issues) {
  const input = normalize(description);
  const words = new Set(input.split(" ").filter(Boolean));

  return issues
    .map((issue) => {
      let score = 0;
      for (const rawKeyword of issue.keywords || []) {
        const keyword = normalize(rawKeyword);
        if (!keyword) continue;
        if (keyword.includes(" ") && input.includes(keyword)) score += 8;
        else if (words.has(keyword)) score += 4;
        else if (keyword.split(" ").some((word) => words.has(word))) score += 1;
      }

      const context = normalize(`${issue.title || ""} ${issue.category || ""} ${issue.description || ""}`);
      for (const word of words) {
        if (word.length > 3 && context.includes(word)) score += 0.35;
      }
      return { issue, score };
    })
    .sort((a, b) => b.score - a.score)[0]?.issue || issues[0];
}

function parseCookies(header = "") {
  return Object.fromEntries(
    header.split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
      const separator = part.indexOf("=");
      return separator < 0 ? [part, ""] : [part.slice(0, separator), part.slice(separator + 1)];
    }),
  );
}

function readState(request) {
  try {
    const encoded = parseCookies(request.headers.get("cookie") || "")[COOKIE_NAME];
    return encoded ? JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) : null;
  } catch {
    return null;
  }
}

function stateCookie(state) {
  if (!state) return `${COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=None`;
  const encoded = Buffer.from(JSON.stringify(state), "utf8").toString("base64url");
  return `${COOKIE_NAME}=${encoded}; Max-Age=${COOKIE_MAX_AGE}; Path=/; HttpOnly; Secure; SameSite=None`;
}

function escapeXml(value) {
  return String(value).replace(/[<>&"']/g, (character) => ({
    "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;",
  })[character]);
}

function twiml(messages, state) {
  const list = Array.isArray(messages) ? messages : [messages];
  const body = `<?xml version="1.0" encoding="UTF-8"?><Response>${list
    .map((message) => `<Message>${escapeXml(message)}</Message>`).join("")}</Response>`;

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      "Cache-Control": "no-store",
      "Set-Cookie": stateCookie(state),
    },
  });
}

function formatDate(value) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function issueLocation(issue) {
  if (typeof issue.location === "string") return issue.location;
  return [issue.location?.landmark, issue.location?.area, issue.location?.city].filter(Boolean).join(", ")
    || issue.location?.address || issue.location?.name || "Location unavailable";
}

function firstReported(issue) {
  return issue.reportedAt || issue.date || issue.timeline?.[0]?.date;
}

function isYes(body) {
  return /^(yes|y|1|yes same issue|same issue)$/i.test(body.trim());
}

function isNo(body) {
  return /^(no|n|2|no this is different|this is different|different)$/i.test(body.trim());
}

export default {
  async fetch(request) {
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
    }

    const form = await request.formData();
    const body = String(form.get("Body") || "").trim();
    const normalizedBody = normalize(body);
    const mediaCount = Number(form.get("NumMedia") || 0);
    const hasImage = mediaCount > 0 || Boolean(form.get("MediaUrl0"));
    const latitude = String(form.get("Latitude") || "").trim();
    const longitude = String(form.get("Longitude") || "").trim();
    const address = String(form.get("Address") || form.get("Label") || "").trim();
    let state = readState(request);

    if (normalizedBody === "restart" || normalizedBody === "start over") state = null;

    if (!state) {
      if (!body) return twiml("Please describe the issue you would like to report.", { step: "description" });
      return twiml("Please share a relevant photo for the issue", { step: "photo", description: body });
    }

    if (state.step === "description") {
      if (!body) return twiml("Please describe the issue you would like to report.", state);
      return twiml("Please share a relevant photo for the issue", { step: "photo", description: body });
    }

    if (state.step === "photo") {
      if (!hasImage) return twiml("Please share a relevant photo for the issue", state);
      return twiml("Please share the location of the issue.", {
        ...state,
        step: "location",
        mediaCount: Math.max(mediaCount, 1),
      });
    }

    if (state.step === "location") {
      if (!latitude || !longitude) return twiml("Please share the location of the issue.", state);

      try {
        const dataResponse = await fetch(new URL("/mock-data.json", request.url));
        if (!dataResponse.ok) throw new Error("Issue data unavailable");
        const data = await dataResponse.json();
        const issues = Array.isArray(data) ? data : data.issues;
        const match = matchIssue(state.description, issues || []);
        if (!match) throw new Error("No issue records available");

        const distanceMeters = Math.round(Number(match.location?.distanceKm || match.distanceKm || match.distance || 0.4) * 1000);
        const matchMessage = [
          `*I found a similar issue ${distanceMeters} metres away*`,
          "",
          `*${match.title}*`,
          match.description,
          `📍 ${issueLocation(match)}`,
          `📅 First reported: ${formatDate(firstReported(match))}`,
          "",
          "Please reply with:",
          "*1. Yes, same issue*",
          "*2. No, this is different*",
        ].join("\n");

        await new Promise((resolve) => setTimeout(resolve, 2000));
        return twiml(["Checking nearby reports...", matchMessage], {
          ...state,
          step: "confirmation",
          latitude,
          longitude,
          address,
          matchedIssueId: match.id,
        });
      } catch {
        return twiml("I couldn't check nearby reports right now. Please share the location again to retry.", state);
      }
    }

    if (state.step === "confirmation") {
      if (isYes(body)) {
        return twiml("✅ *Success!* Your report has been linked to the existing issue. You’re now following its updates.", null);
      }
      if (isNo(body)) {
        return twiml("✅ *Report submitted!* Your issue has been created as a new public report.", null);
      }
      return twiml("Please reply with *1* for Yes, same issue or *2* for No, this is different.", state);
    }

    return twiml("Please describe the issue you would like to report.", { step: "description" });
  },
};
