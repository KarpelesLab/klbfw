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
declare function rest(name: string, verb: string, params?: Record<string, any>, context?: Record<string, any>): Promise<any>;
declare function rest_get(name: string, params?: Record<string, any>): Promise<any>; // Backward compatibility
declare function restGet(name: string, params?: Record<string, any>): Promise<any>;
declare function restSSE(name: string, method: 'GET', params?: Record<string, any>, context?: Record<string, any>): EventSource;

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
  UploadFileInput,
  UploadFileOptions,
  UploadManyFilesOptions
};