/**
 * Deno tests for shared HTTP Pattern-A helpers (BILLING-91).
 *
 * Run:
 *   deno test --no-lock supabase/functions/_shared/http_test.ts
 *
 * No network/env/read/write capabilities required.
 */

import {
  internalError,
  unauthorized,
  upstreamError,
} from "./http.ts";

declare const Deno: {
  test: (name: string, fn: () => void | Promise<void>) => void;
};

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEquals(
  actual: unknown,
  expected: unknown,
  message: string,
): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(
      `${message}\n  actual:   ${actualJson}\n  expected: ${expectedJson}`,
    );
  }
}

const EXPECTED_CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
} as const;

const CONTENT_TYPE = "application/json; charset=utf-8";

const LEAK_TOKENS = [
  "reason",
  "details",
  "stack",
  "cause",
  "database",
  "stripe",
  "supabase",
  "tenant",
  "sqlstate",
] as const;

async function readBody(response: Response): Promise<unknown> {
  return JSON.parse(await response.text());
}

function assertSharedHeaders(response: Response, messagePrefix: string): void {
  assertEquals(
    response.headers.get("content-type"),
    CONTENT_TYPE,
    `${messagePrefix} content-type`,
  );
  for (const [name, value] of Object.entries(EXPECTED_CORS)) {
    assertEquals(
      response.headers.get(name),
      value,
      `${messagePrefix} ${name}`,
    );
  }
}

Deno.test("A–E. internalError() default is opaque HTTP 500 Pattern-A", async () => {
  const response = internalError();
  assertEquals(response.status, 500, "A. status 500");
  assertSharedHeaders(response, "C/D. internalError default");

  const body = await readBody(response);
  assertEquals(
    body,
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "Internal server error.",
      },
    },
    "B. exact Pattern-A envelope",
  );

  const serialized = JSON.stringify(body).toLowerCase();
  for (const token of LEAK_TOKENS) {
    assert(
      !serialized.includes(token),
      `E. body must not contain ${token}`,
    );
  }
});

Deno.test("F. internalError custom message is kept exactly", async () => {
  const custom = "Keep this message EXACTLY as-is.";
  const response = internalError(custom);
  assertEquals(response.status, 500, "custom message still 500");
  const body = await readBody(response);
  assertEquals(
    body,
    {
      error: {
        code: "INTERNAL_ERROR",
        message: custom,
      },
    },
    "custom message preserved exactly",
  );
});

Deno.test("G. upstreamError() contract unchanged after INTERNAL_ERROR", async () => {
  const response = upstreamError();
  assertEquals(response.status, 502, "upstreamError status 502");
  assertSharedHeaders(response, "G. upstreamError");
  const body = await readBody(response);
  assertEquals(
    body,
    {
      error: {
        code: "UPSTREAM_ERROR",
        message: "Upstream service request failed.",
      },
    },
    "upstreamError envelope unchanged",
  );
});

Deno.test("G. unauthorized() contract unchanged after INTERNAL_ERROR", async () => {
  const response = unauthorized();
  assertEquals(response.status, 401, "unauthorized status 401");
  assertSharedHeaders(response, "G. unauthorized");
  const body = await readBody(response);
  assertEquals(
    body,
    {
      error: {
        code: "UNAUTHORIZED",
        message: "Missing or invalid Authorization header.",
      },
    },
    "unauthorized envelope unchanged",
  );
});
