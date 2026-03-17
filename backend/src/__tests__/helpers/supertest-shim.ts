import inject from 'light-my-request';
import type { IncomingHttpHeaders } from 'node:http';

type RequestHandler = (req: unknown, res: unknown) => void;
type ServerLike = { listeners(event: 'request'): RequestHandler[] };

type ResponseLike = {
  status: number;
  statusCode: number;
  headers: IncomingHttpHeaders;
  text: string;
  body: unknown;
};

class InjectTestRequest implements PromiseLike<ResponseLike> {
  private readonly method: string;
  private url: string;
  private readonly server: ServerLike;
  private readonly headers: Record<string, string> = {};
  private payload: unknown;
  private expectedStatus: number | null = null;

  constructor(server: ServerLike, method: string, url: string) {
    this.server = server;
    this.method = method;
    this.url = url;
  }

  query(params: Record<string, unknown>): this {
    const baseUrl = this.url.startsWith('http') ? this.url : `http://localhost${this.url}`;
    const parsed = new URL(baseUrl);
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) {
        continue;
      }
      parsed.searchParams.set(key, String(value));
    }
    this.url = `${parsed.pathname}${parsed.search}`;
    return this;
  }

  set(name: string, value: string): this {
    this.headers[name.toLowerCase()] = value;
    return this;
  }

  send(payload: unknown): this {
    this.payload = payload;
    return this;
  }

  expect(status: number): this {
    this.expectedStatus = status;
    return this;
  }

  then<TResult1 = ResponseLike, TResult2 = never>(
    onfulfilled?: ((value: ResponseLike) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled ?? undefined, onrejected ?? undefined);
  }

  catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null
  ): Promise<ResponseLike | TResult> {
    return this.execute().catch(onrejected ?? undefined);
  }

  finally(onfinally?: (() => void) | null): Promise<ResponseLike> {
    return this.execute().finally(onfinally ?? undefined);
  }

  private async execute(): Promise<ResponseLike> {
    const requestHandler = this.server.listeners('request')[0];
    if (!requestHandler) {
      throw new Error('No request handler registered on server');
    }

    const reqOptions: {
      method: string;
      url: string;
      headers?: Record<string, string>;
      payload?: string;
    } = {
      method: this.method,
      url: this.url,
    };

    if (Object.keys(this.headers).length > 0) {
      reqOptions.headers = this.headers;
    }

    if (this.payload !== undefined) {
      if (typeof this.payload === 'string') {
        reqOptions.payload = this.payload;
      } else {
        reqOptions.payload = JSON.stringify(this.payload);
        if (!this.headers['content-type']) {
          this.headers['content-type'] = 'application/json';
          reqOptions.headers = this.headers;
        }
      }
    }

    const response = await inject(requestHandler, reqOptions);
    const text = response.payload ?? '';

    let body: unknown = {};
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }

    const normalized: ResponseLike = {
      status: response.statusCode,
      statusCode: response.statusCode,
      headers: response.headers as IncomingHttpHeaders,
      text,
      body,
    };

    if (this.expectedStatus !== null && normalized.status !== this.expectedStatus) {
      throw new Error(
        `Expected status ${this.expectedStatus} but received ${normalized.status}. Body: ${normalized.text}`
      );
    }

    return normalized;
  }
}

type RequestFactory = {
  get: (url: string) => InjectTestRequest;
  post: (url: string) => InjectTestRequest;
  put: (url: string) => InjectTestRequest;
  patch: (url: string) => InjectTestRequest;
  delete: (url: string) => InjectTestRequest;
  head: (url: string) => InjectTestRequest;
};

export default function request(server: ServerLike): RequestFactory {
  return {
    get: (url: string) => new InjectTestRequest(server, 'GET', url),
    post: (url: string) => new InjectTestRequest(server, 'POST', url),
    put: (url: string) => new InjectTestRequest(server, 'PUT', url),
    patch: (url: string) => new InjectTestRequest(server, 'PATCH', url),
    delete: (url: string) => new InjectTestRequest(server, 'DELETE', url),
    head: (url: string) => new InjectTestRequest(server, 'HEAD', url),
  };
}
