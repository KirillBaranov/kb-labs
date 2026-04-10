export type SchemaFormat = 'zod' | 'json-schema' | 'openapi';

export interface SchemaReference {
  ref: string;
  format?: SchemaFormat;
  description?: string;
}

export interface RestRouteContract {
  id: string;
  method: string;
  path: string;
  description?: string;
  request?: SchemaReference;
  response?: SchemaReference;
  produces?: string[];
  consumes?: string[];
}

export interface RestApiContract {
  basePath: string;
  routes: Record<string, RestRouteContract>;
}

export interface ApiContract {
  rest?: RestApiContract;
}
