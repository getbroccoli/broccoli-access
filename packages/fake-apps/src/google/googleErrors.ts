import type { Response } from "express";

/** The errors a connector reports; the fake can make any Admin API call fail with each. */
export const CONNECTOR_ERRORS = [
  "authentication_failed",
  "permission_missing",
  "rate_limited",
  "app_unavailable",
  "unexpected_response",
] as const;

export type ConnectorError = (typeof CONNECTOR_ERRORS)[number];

/** Google's error answers of the Admin APIs, by what went wrong. */
export type GoogleApiError =
  | "unauthenticated"
  | "insufficientPermissions"
  | "forbidden"
  | "rateLimitExceeded"
  | "backendError"
  | "invalid"
  | "badRequest"
  | "notFound"
  | "duplicate";

/** Answers with Google's JSON error body for `error`. */
export function sendGoogleError(response: Response, error: GoogleApiError): void {
  const {
    code,
    status,
    message,
    reason,
    detail = message,
    domain = "global",
    location,
  } = GOOGLE_ERRORS[error];
  response.status(code).json({
    error: { code, message, errors: [{ message: detail, domain, reason, ...location }], status },
  });
}

/** Answers the way Google answers when a call fails with the connector error `error`. */
export function sendConnectorFailure(response: Response, error: ConnectorError): void {
  if (error === "unexpected_response") {
    // A 200 whose body no Google schema accepts, as a broken or changed API would send.
    response.status(200).json(["unexpected_response"]);
    return;
  }
  sendGoogleError(response, CONNECTOR_FAILURES[error]);
}

const CONNECTOR_FAILURES: Record<Exclude<ConnectorError, "unexpected_response">, GoogleApiError> = {
  authentication_failed: "unauthenticated",
  permission_missing: "insufficientPermissions",
  rate_limited: "rateLimitExceeded",
  app_unavailable: "backendError",
};

interface GoogleErrorBody {
  code: number;
  status: string;
  message: string;
  reason: string;
  /** The message of the `errors` entry, when Google words it apart from the top one. */
  detail?: string;
  domain?: string;
  location?: { location: string; locationType: string };
}

const GOOGLE_ERRORS: Record<GoogleApiError, GoogleErrorBody> = {
  unauthenticated: {
    code: 401,
    status: "UNAUTHENTICATED",
    message:
      "Request had invalid authentication credentials. Expected OAuth 2 access token, login cookie or other valid authentication credential. See https://developers.google.com/identity/sign-in/web/devconsole-project.",
    reason: "authError",
    detail: "Invalid Credentials",
    location: { location: "Authorization", locationType: "header" },
  },
  insufficientPermissions: {
    code: 403,
    status: "PERMISSION_DENIED",
    message: "Request had insufficient authentication scopes.",
    reason: "insufficientPermissions",
    detail: "Insufficient Permission",
  },
  forbidden: {
    code: 403,
    status: "PERMISSION_DENIED",
    message: "Not Authorized to access this resource/api",
    reason: "forbidden",
  },
  rateLimitExceeded: {
    code: 429,
    status: "RESOURCE_EXHAUSTED",
    message: "Rate Limit Exceeded",
    reason: "rateLimitExceeded",
    domain: "usageLimits",
  },
  backendError: {
    code: 503,
    status: "UNAVAILABLE",
    message: "Backend Error",
    reason: "backendError",
  },
  invalid: { code: 400, status: "INVALID_ARGUMENT", message: "Invalid Input", reason: "invalid" },
  badRequest: {
    code: 400,
    status: "INVALID_ARGUMENT",
    message: "Bad Request",
    reason: "badRequest",
  },
  notFound: {
    code: 404,
    status: "NOT_FOUND",
    message: "Resource Not Found: userKey",
    reason: "notFound",
  },
  duplicate: {
    code: 409,
    status: "ALREADY_EXISTS",
    message: "Entity already exists.",
    reason: "duplicate",
  },
};
