/**
 * Node-only auth helpers for @karpeleslab/klbfw.
 *
 * Not exported from the main entry; require it directly from Node:
 *
 *     const { AuthInfo, bearerAuth } = require('@karpeleslab/klbfw/auth-node');
 *     const klbfw = require('@karpeleslab/klbfw');
 *
 *     const info = new AuthInfo();
 *     await info.init();
 *     try { await info.load(); } catch (_) { await info.login(); await info.save(); }
 *     klbfw.setAuth(bearerAuth(info));
 */

import { AuthProvider } from './index';

/** Token payload returned by the OAuth2 token endpoint. */
export interface AuthToken {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  ClientID?: string;
  [key: string]: any;
}

/** Constructor options for AuthInfo. */
export interface AuthInfoOptions {
  /** Profile name — used in the on-disk filename. Defaults to $SHELLS_PROFILE or 'default'. */
  profile?: string;
  /** OAuth2 client_id. */
  clientId?: string;
  /** API host (e.g. 'hub.atonline.com'). */
  apiHost?: string;
  /** API base path (e.g. '/_special/rest/'). */
  apiBasePath?: string;
}

/**
 * Holds an OAuth2 access/refresh token pair and persists it to
 * ~/.config/atonline/auth-<profile>.json.
 */
export class AuthInfo {
  constructor(options?: AuthInfoOptions);
  token: AuthToken | null;
  name: string;
  clientId: string;
  apiHost: string;
  apiBasePath: string;
  filepath: string | null;

  /** Create the config dir and resolve the on-disk path. Call before load/save. */
  init(): Promise<void>;
  /** Load the persisted token. Throws if no token has been saved yet. */
  load(): Promise<void>;
  /** Persist the current token to disk (mode 0600). */
  save(): Promise<void>;
  /** Run the OAuth2 polltoken login flow. Prints a URL the user has to open. */
  login(): Promise<void>;
  /** Exchange the refresh_token for a fresh access_token. */
  renewToken(): Promise<void>;
}

/**
 * Build an auth provider from an AuthInfo instance. Pass the result to setAuth().
 */
export function bearerAuth(authInfo: AuthInfo): AuthProvider;
