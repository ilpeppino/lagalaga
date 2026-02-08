/**
 * Shared API response envelope types.
 * Used by both frontend and backend for consistent API responses.
 */

import type { ErrorSeverity } from './codes.js';

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  requestId: string;
}

export interface ApiErrorDetail {
  code: string;
  message: string;
  statusCode: number;
  severity: ErrorSeverity;
  requestId: string;
  details?: unknown;
}

export interface ApiErrorResponse {
  success: false;
  error: ApiErrorDetail;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;
