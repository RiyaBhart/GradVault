/**
 * api.js — Utility for calling backend endpoints.
 * Automatically injects the JWT token if available.
 */

let currentToken = null;

export function setApiToken(token) {
  currentToken = token;
}

export async function apiCall(endpoint, options = {}) {
  const headers = {
    ...options.headers,
  };

  // Only default to JSON content-type if the body is not FormData
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
  }

  if (currentToken) {
    headers["Authorization"] = `Bearer ${currentToken}`;
  }

  const response = await fetch(`/api${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorDetail = "API Error";
    try {
      const errData = await response.json();
      errorDetail = errData.detail || errorDetail;
    } catch {
      // Not JSON or empty body
    }
    throw new Error(errorDetail);
  }

  // Handle 204 or empty response
  if (response.status === 204) {
    return null;
  }

  try {
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * apiFetch — Like apiCall but returns the raw Response object.
 * Use this when you need binary data (photos) or must inspect
 * the Content-Type header before deciding how to parse the body.
 * Throws an Error (with detail message) on non-2xx responses.
 */
export async function apiFetch(endpoint, options = {}) {
  const headers = {
    ...options.headers,
  };

  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
  }

  if (currentToken) {
    headers["Authorization"] = `Bearer ${currentToken}`;
  }

  const response = await fetch(`/api${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorDetail = "API Error";
    try {
      const errData = await response.json();
      errorDetail = errData.detail || errorDetail;
    } catch {
      // Not JSON or empty body
    }
    throw new Error(errorDetail);
  }

  return response; // caller reads .json(), .blob(), etc.
}

