const responseBody = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Test issue received</Message>
</Response>`;

export default {
  async fetch(request) {
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: { Allow: "POST" },
      });
    }

    return new Response(responseBody, {
      status: 200,
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  },
};
