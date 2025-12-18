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
  /** Current page number (1-indexed) */
  page_no: number;
  /** Total number of results across all pages */
  count: number;
  /** Maximum page number available */
  page_max: number;
  /** Number of results per page */
  results_per_page: number;
}

/**
 * Successful REST API response wrapper
 * @typeParam T - Type of the data field
 */
interface RestResponse<T = any> {
  /** Result status */
  result: 'success' | 'redirect';
  /** Unique request identifier for debugging */
  request_id: string;
  /** Request processing time in seconds */
  time: number;
  /** Response payload */
  data: T;
  /** Paging information for list endpoints */
  paging?: RestPaging;
  /** Additional response fields */
  [key: string]: any;
}

/** REST API error object (thrown on promise rejection) */
interface RestError {
  /** Always 'error' for error responses */
  result: 'error';
  /** Exception class name from server */
  exception: string;
  /** Human-readable error message */
  error: string;
  /** HTTP status code */
  code: number;
  /** Translatable error token (e.g., 'error_invalid_field') */
  token: string;
  /** Request ID for debugging */
  request: string;
  /** Structured message data for translation */
  message: Record<string, any>;
  /** Parameter name that caused the error, if applicable */
  param?: string;
  /** Request processing time in seconds */
  time: number;
  /** Additional error fields */
  [key: string]: any;
}

/**
 * Server DateTime object
 * @example
 * // Convert to JavaScript Date
 * new Date(Number(datetime.unixms))
 */
interface DateTime {
  /** Unix timestamp in milliseconds (use this for JS Date conversion) */
  unixms: string | number;
  /** Unix timestamp in seconds */
  unix?: number;
  /** Microseconds component */
  us?: number;
  /** ISO 8601 formatted string with microseconds */
  iso?: string;
  /** Timezone identifier (e.g., 'Asia/Tokyo') */
  tz?: string;
  /** Full precision timestamp as string (unix seconds + microseconds) */
  full?: string;
}

/**
 * Extended integer for precise decimal arithmetic without floating-point errors.
 * Value = v / 10^e = f
 *
 * When sending to API, you can provide either:
 * - Just `f` (as string or number)
 * - Both `v` and `e`
 *
 * @example
 * // $358.20 represented as:
 * { v: "35820000", e: 5, f: 358.2 }
 */
interface Xint {
  /** Integer value (multiply by 10^-e to get actual value) */
  v?: string;
  /** Exponent (number of decimal places) */
  e?: number;
  /** Float value (convenience field, may have precision loss) */
  f?: string | number;
}

/** Base price value without tax breakdown */
interface PriceValue {
  /** Decimal value as string (e.g., "358.20000") */
  value: string;
  /** Integer representation for precise arithmetic */
  value_int: string;
  /** Value in cents/smallest currency unit */
  value_cent: string;
  /** Display-ready decimal string (e.g., "358.20") */
  value_disp: string;
  /** Extended integer for precise calculations */
  value_xint: Xint;
  /** Formatted display string with currency symbol (e.g., "$358.20") */
  display: string;
  /** Short formatted display string */
  display_short: string;
  /** ISO 4217 currency code (e.g., "USD") */
  currency: string;
  /** Currency unit (usually same as currency) */
  unit: string;
  /** Whether VAT/tax is included in this value */
  has_vat: boolean;
  /** Tax profile identifier or null if exempt */
  tax_profile: string | null;
}

/**
 * Full price object with optional tax breakdown
 * @example
 * // Display price with tax info
 * console.log(price.display);           // "$358.20"
 * console.log(price.tax?.display);      // "$358.20" (with tax)
 * console.log(price.tax_only?.display); // "$0.00" (tax amount only)
 */
interface Price extends PriceValue {
  /** Original price before any tax calculations */
  raw?: PriceValue;
  /** Price including tax */
  tax?: PriceValue;
  /** Tax amount only */
  tax_only?: PriceValue;
  /** Tax rate as decimal (e.g., 0.1 for 10%) */
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
  Xint,
  PriceValue,
  Price,
  UploadFileInput,
  UploadFileOptions,
  UploadManyFilesOptions,
  SSEMessageEvent,
  SSEErrorEvent,
  SSESource
};