/**
 * HumanID SDK Error Types
 */

import type { ErrorResponse } from './types';

export class HumanIDError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly detail: string;
  public readonly requestId?: string;

  constructor(response: ErrorResponse) {
    super(response.detail);
    this.name = 'HumanIDError';
    this.status = response.status;
    this.code = response.type?.split('/').pop() || 'unknown';
    this.detail = response.detail;
    this.requestId = response.request_id;
  }
}

export class NetworkError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'NetworkError';
  }
}
