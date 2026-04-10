import type { KBError } from '../errors/kb-error';

export interface FetchOptions extends RequestInit {
  timeout?: number;
}

export interface ResponseError {
  status: number;
  statusText: string;
  data?: unknown;
}

export interface RequestInterceptor {
  (config: FetchOptions): FetchOptions | Promise<FetchOptions>;
}

export interface ResponseInterceptor {
  (response: Response): Response | Promise<Response>;
}

export interface ErrorInterceptor {
  (error: KBError): KBError | Promise<KBError>;
}

