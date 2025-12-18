/**
 * Type definitions for @karpeleslab/klbfw
 */

// Framework wrapper types
declare function GET(): Record<string, string>;
declare function Get(key?: string): string | Record<string, string> | undefined;
declare function flushGet(): void;
declare function getPrefix(): string;
declare function getSettings(): Record<string, any>;
declare function getRealm(): Record<string, any>;
declare function getContext(): Record<string, any>;
declare function setContext(key: string, value: any): void;
declare function getMode(): string;
declare function getHostname(): string;
declare function getRegistry(): Record<string, any> | undefined;
declare function getLocale(): string;
declare function getUserGroup(): string | undefined;
declare function getCurrency(): string;
declare function getToken(): string | undefined;
declare function getUrl(): { path: string; full: string; host: string; query: string; scheme: string };
declare function getPath(): string;
declare function getUuid(): string | undefined;
declare function getInitialState(): Record<string, any> | undefined;

// Cookie handling types
declare function getCookie(name: string): string | null;
declare function hasCookie(name: string): boolean;
declare function setCookie(name: string, value: string, expires?: Date | number, path?: string, domain?: string, secure?: boolean): void;

// REST API types

/** Paging information returned by list endpoints */
interface RestPaging {
  page_no: number;
  count: number;
  page_max: number;
  results_per_page: number;
}

/** Successful REST API response */
interface RestResponse<T = any> {
  result: 'success' | 'redirect';
  request_id: string;
  time: number;
  data: T;
  paging?: RestPaging;
  [key: string]: any;
}

/** REST API error (thrown on rejection) */
interface RestError {
  result: 'error';
  exception: string;
  error: string;
  code: number;
  token: string;
  request: string;
  message: Record<string, any>;
  param?: string;
  time: number;
  [key: string]: any;
}

/** Server DateTime object with Unix milliseconds timestamp */
interface DateTime {
  unixms: string | number;
  unix?: number;
  us?: number;
  iso?: string;
  tz?: string;
  full?: string;
}

/** Extended integer representation for precise arithmetic */
interface PriceXint {
  v: string;
  e: number;
  f: number;
}

/** Base price value without tax breakdown */
interface PriceValue {
  value: string;
  value_int: string;
  value_cent: string;
  value_disp: string;
  value_xint: PriceXint;
  display: string;
  display_short: string;
  currency: string;
  unit: string;
  has_vat: boolean;
  tax_profile: string | null;
}

/** Full price object with optional tax breakdown */
interface Price extends PriceValue {
  raw?: PriceValue;
  tax?: PriceValue;
  tax_only?: PriceValue;
  tax_rate?: number;
}

declare function rest<T = any>(name: string, verb: string, params?: Record<string, any>, context?: Record<string, any>): Promise<RestResponse<T>>;
declare function rest_get<T = any>(name: string, params?: Record<string, any>): Promise<RestResponse<T>>; // Backward compatibility
declare function restGet<T = any>(name: string, params?: Record<string, any>): Promise<RestResponse<T>>;

/** SSE message event */
interface SSEMessageEvent {
  /** Event type */
  type: string;
  /** Event data */
  data: string;
  /** Last event ID */
  lastEventId: string;
  /** Origin */
  origin: string;
}

/** SSE error event */
interface SSEErrorEvent {
  type: 'error';
  error: Error | Record<string, any>;
}

/** EventSource-like object returned by restSSE */
interface SSESource {
  /** Handler called when connection opens */
  onopen: ((event: { type: 'open' }) => void) | null;
  /** Handler called for message events */
  onmessage: ((event: SSEMessageEvent) => void) | null;
  /** Handler called on error */
  onerror: ((event: SSEErrorEvent) => void) | null;
  /** Connection state: 0 = CONNECTING, 1 = OPEN, 2 = CLOSED */
  readyState: number;
  /** CONNECTING state constant */
  readonly CONNECTING: 0;
  /** OPEN state constant */
  readonly OPEN: 1;
  /** CLOSED state constant */
  readonly CLOSED: 2;
  /** Add event listener for specific event type */
  addEventListener(type: string, listener: (event: SSEMessageEvent) => void): void;
  /** Remove event listener */
  removeEventListener(type: string, listener: (event: SSEMessageEvent) => void): void;
  /** Close the connection */
  close(): void;
}

declare function restSSE(name: string, method?: string, params?: Record<string, any>, context?: Record<string, any>): SSESource;

// Upload module types

/** File input types supported by uploadFile */
type UploadFileInput =
  | ArrayBuffer
  | Uint8Array
  | File
  | string
  | { name?: string; size?: number; type?: string; content: ArrayBuffer | Uint8Array | string; lastModified?: number }
  | NodeJS.ReadableStream;

/** Options for uploadFile */
interface UploadFileOptions {
  /** Progress callback (0-1) */
  onProgress?: (progress: number) => void;
  /** Error callback - resolve to retry, reject to fail */
  onError?: (error: Error, context: { phase: string; blockNum?: number; attempt: number }) => Promise<void>;
}

/** Options for uploadManyFiles */
interface UploadManyFilesOptions extends UploadFileOptions {
  /** Progress callback with file-level details */
  onProgress?: (progress: { fileIndex: number; fileCount: number; fileProgress: number; totalProgress: number }) => void;
  /** Called when each file completes */
  onFileComplete?: (info: { fileIndex: number; fileCount: number; result: any }) => void;
  /** Error callback - context includes fileIndex */
  onError?: (error: Error, context: { fileIndex: number; phase: string; blockNum?: number; attempt: number }) => Promise<void>;
  /** Maximum concurrent uploads (1-10, default 3) */
  concurrency?: number;
}

/** @deprecated Use uploadFile() instead */
interface UploadLegacyOptions {
  progress?: (progress: number) => void;
  endpoint?: string;
  headers?: Record<string, string>;
  retry?: number;
  chunk_size?: number;
  params?: Record<string, any>;
}

/** @deprecated Use uploadFile() instead */
declare const upload: {
  init(path: string, params?: Record<string, any>, notify?: (status: any) => void): Promise<any> | ((files: any) => Promise<any>);
  append(path: string, file: File | object, params?: Record<string, any>, context?: Record<string, any>): Promise<any>;
  run(): void;
  getStatus(): { queue: any[]; running: any[]; failed: any[] };
  resume(): void;
  cancelItem(uploadId: number): void;
  deleteItem(uploadId: number): void;
  pauseItem(uploadId: number): void;
  resumeItem(uploadId: number): void;
  retryItem(uploadId: number): void;
  onprogress?: (status: { queue: any[]; running: any[]; failed: any[] }) => void;
};

/** Upload a single file. Resolves with the full REST response. */
declare function uploadFile(
  api: string,
  buffer: UploadFileInput,
  method?: string,
  params?: Record<string, any>,
  context?: Record<string, any>,
  options?: UploadFileOptions
): Promise<any>;

/** Upload multiple files with concurrency control */
declare function uploadManyFiles(
  api: string,
  files: UploadFileInput[],
  method?: string,
  params?: Record<string, any>,
  context?: Record<string, any>,
  options?: UploadManyFilesOptions
): Promise<any[]>;

// Utility types
declare function getI18N(key: string, args?: Record<string, any>): string;
declare function trimPrefix(path: string): string;

export {
  GET,
  Get,
  flushGet,
  getPrefix,
  getSettings,
  getRealm,
  getContext,
  setContext,
  getMode,
  getHostname,
  getRegistry,
  getLocale,
  getUserGroup,
  getCurrency,
  getToken,
  getUrl,
  getPath,
  getUuid,
  getInitialState,
  getCookie,
  hasCookie,
  setCookie,
  rest,
  rest_get,
  restGet,
  restSSE,
  upload,
  uploadFile,
  uploadManyFiles,
  getI18N,
  trimPrefix,
  RestPaging,
  RestResponse,
  RestError,
  DateTime,
  PriceXint,
  PriceValue,
  Price,
  UploadFileInput,
  UploadFileOptions,
  UploadManyFilesOptions,
  SSEMessageEvent,
  SSEErrorEvent,
  SSESource
};