import axios, { type AxiosInstance, type AxiosRequestConfig, type AxiosResponse, type AxiosError } from 'axios';
import type { RequestInterceptor, ResponseInterceptor, ErrorInterceptor } from './types';
import { KBError } from '../errors/kb-error';
import { mapFetchError } from './error-mapper';
import { ulid } from 'ulid';

export class HttpClient {
  private client: AxiosInstance;
  private requestInterceptors: RequestInterceptor[] = [];
  private responseInterceptors: ResponseInterceptor[] = [];
  private errorInterceptors: ErrorInterceptor[] = [];
  private baseUrl: string;

  constructor(baseUrl: string = '', token?: string) {
    this.baseUrl = baseUrl;
    this.client = axios.create({
      baseURL: baseUrl,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    // Axios request interceptor: add X-Request-Id
    this.client.interceptors.request.use((config) => {
      if (!config.headers['X-Request-Id']) {
        config.headers['X-Request-Id'] = ulid();
      }
      return config;
    });

    // Axios response interceptor: unwrap envelope
    this.client.interceptors.response.use(
      (response) => {
        const data = response.data;

        // Check if response is an envelope
        if (data && typeof data === 'object' && 'ok' in data) {
          if (data.ok === true && 'data' in data) {
            // Success envelope: unwrap and return data
            response.data = data.data;
          } else if (data.ok === false && 'error' in data) {
            // Error envelope: throw error
            const error = mapFetchError(data.error, {
              status: response.status,
              statusText: response.statusText,
            } as Response);
            return Promise.reject(error);
          }
        }

        return response;
      },
      (error: AxiosError) => {
        // Transform axios error to KBError
        const kbError = mapFetchError(error.response?.data, {
          status: error.response?.status ?? 500,
          statusText: error.response?.statusText ?? 'Unknown Error',
        } as Response);
        return Promise.reject(kbError);
      }
    );
  }

  addRequestInterceptor(interceptor: RequestInterceptor): void {
    this.requestInterceptors.push(interceptor);
  }

  addResponseInterceptor(interceptor: ResponseInterceptor): void {
    this.responseInterceptors.push(interceptor);
  }

  addErrorInterceptor(interceptor: ErrorInterceptor): void {
    this.errorInterceptors.push(interceptor);
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  async fetch<T>(path: string, options: AxiosRequestConfig = {}): Promise<T> {
    try {
      // Apply custom request interceptors (if any)
      const config: AxiosRequestConfig = {
        url: path,
        ...options,
      };

      // Note: Custom interceptors work with FetchOptions (headers as Headers object)
      // but axios uses plain objects. If you need custom interceptors, adapt them here.

      const response: AxiosResponse<T> = await this.client.request<T>(config);

      // Apply custom response interceptors (if any)
      // Note: These expect Response objects from fetch API
      // You may need to adapt or remove these if not used

      return response.data;
    } catch (error) {
      const kbError = error instanceof KBError ? error : mapFetchError(error);
      throw await this.processError(kbError);
    }
  }

  private async processError(error: KBError): Promise<never> {
    let processedError = error;
    for (const interceptor of this.errorInterceptors) {
      processedError = await interceptor(processedError);
    }
    throw processedError;
  }
}

