/** Base class for all expected, domain-level failures. */
export class AppError extends Error {
  /**
   * @param {string} message
   * @param {{ cause?: unknown, retryable?: boolean }} [options]
   */
  constructor(message, { cause, retryable = false } = {}) {
    super(message, { cause });
    this.name = this.constructor.name;
    this.retryable = retryable;
  }
}

/** Transport-level failure (DNS, reset, timeout). Retryable. */
export class NetworkError extends AppError {
  constructor(message, options) {
    super(message, { ...options, retryable: true });
  }
}

/** Non-2xx response. Retryable only for 429 / 5xx. */
export class HttpError extends AppError {
  /** @param {number} status */
  constructor(message, status) {
    super(message, { retryable: status === 429 || status >= 500 });
    this.status = status;
  }
}

/** Response is not what we expect (content-type, size, foreign origin). */
export class ResponseError extends AppError {}

/** The site markup no longer matches what the parser understands. */
export class LayoutChangedError extends AppError {}

/** Parsed data is inconsistent / incomplete and must not be published. */
export class DataValidationError extends AppError {}
