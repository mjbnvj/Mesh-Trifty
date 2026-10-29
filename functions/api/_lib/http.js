export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

export async function readJson(request) {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    throw new HttpError(415, "Send this request as JSON.");
  }
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 32_768) throw new HttpError(413, "Request body is too large.");
  let value;
  try {
    value = await request.json();
  } catch {
    throw new HttpError(400, "Request body must be valid JSON.");
  }
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw new HttpError(400, "Request body must be a JSON object.");
  }
  return value;
}

export function methodNotAllowed(allow) {
  return new Response(JSON.stringify({ error: "Method not allowed." }), {
    status: 405,
    headers: {
      "Allow": allow,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

export function handleError(error) {
  if (error instanceof HttpError) return json({ error: error.message }, error.status);
  console.error("Store API request failed.", error);
  return json({ error: "The request could not be completed. Please try again." }, 500);
}
