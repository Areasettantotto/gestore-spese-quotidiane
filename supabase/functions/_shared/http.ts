export type ErrorCode =
  | "METHOD_NOT_ALLOWED"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "INVALID_JSON"
  | "INVALID_REQUEST"
  | "UNPROCESSABLE_ENTITY"
  | "SERVICE_UNAVAILABLE"
  | "UPSTREAM_ERROR"
  | "NOT_IMPLEMENTED";

type JsonHeadersInit = Record<string, string>;

const CORS_HEADERS: JsonHeadersInit = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
  "content-type": "application/json; charset=utf-8",
};

export function withCorsHeaders(headers: HeadersInit = {}): Headers {
  const merged = new Headers(CORS_HEADERS);
  const custom = new Headers(headers);

  custom.forEach((value, key) => {
    merged.set(key, value);
  });

  return merged;
}

export function jsonResponse(
  body: { data?: unknown; error?: { code: ErrorCode; message: string } },
  status = 200,
  headers: HeadersInit = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: withCorsHeaders(headers),
  });
}

export function methodNotAllowed(method: string, allowedMethod = "POST"): Response {
  return jsonResponse(
    {
      error: {
        code: "METHOD_NOT_ALLOWED",
        message: `Method ${method} is not allowed.`,
      },
    },
    405,
    { allow: allowedMethod },
  );
}

export function unauthorized(): Response {
  return jsonResponse(
    {
      error: {
        code: "UNAUTHORIZED",
        message: "Missing or invalid Authorization header.",
      },
    },
    401,
  );
}

export function forbidden(): Response {
  return jsonResponse(
    {
      error: {
        code: "FORBIDDEN",
        message: "Insufficient permissions for this tenant.",
      },
    },
    403,
  );
}

export function badRequest(message: string): Response {
  return jsonResponse(
    {
      error: {
        code: "INVALID_REQUEST",
        message,
      },
    },
    400,
  );
}

export function unprocessableEntity(message: string): Response {
  return jsonResponse(
    {
      error: {
        code: "UNPROCESSABLE_ENTITY",
        message,
      },
    },
    422,
  );
}

export function invalidJson(): Response {
  return jsonResponse(
    {
      error: {
        code: "INVALID_JSON",
        message: "Request body must be valid JSON.",
      },
    },
    400,
  );
}

export function notImplemented(message: string): Response {
  return jsonResponse(
    {
      error: {
        code: "NOT_IMPLEMENTED",
        message,
      },
    },
    501,
  );
}

export function serviceUnavailable(
  message = "Service is temporarily unavailable.",
): Response {
  return jsonResponse(
    {
      error: {
        code: "SERVICE_UNAVAILABLE",
        message,
      },
    },
    503,
  );
}

export function upstreamError(
  message = "Upstream service request failed.",
): Response {
  return jsonResponse(
    {
      error: {
        code: "UPSTREAM_ERROR",
        message,
      },
    },
    502,
  );
}
