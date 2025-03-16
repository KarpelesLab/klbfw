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
declare function rest(name: string, verb: string, params?: Record<string, any> | string, context?: Record<string, any>): Promise<any>;
declare function rest_get(name: string, params?: Record<string, any> | string): Promise<any>; // Backward compatibility
declare function restGet(name: string, params?: Record<string, any> | string): Promise<any>;

// Upload module types
interface UploadOptions {
  progress?: (progress: number) => void;
  endpoint?: string;
  headers?: Record<string, string>;
  retry?: number;
  chunk_size?: number;
  params?: Record<string, any>;
}

declare function upload(file: File, options?: UploadOptions): Promise<any>;

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
  upload,
  getI18N,
  trimPrefix
};