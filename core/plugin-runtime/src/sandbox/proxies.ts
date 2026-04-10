/**
 * Compatibility proxies for legacy Node.js APIs
 *
 * These proxies allow plugins using direct Node.js imports (fs, http, etc.)
 * to work transparently by delegating to ctx.runtime.* APIs.
 *
 * Usage: Set KB_SANDBOX_MODE=compat
 */

import type { FSShim, FetchShim, ShellAPI } from '@kb-labs/plugin-contracts';
import { EventEmitter } from 'events';
// Import native fs at module level (BEFORE bundling, avoids "Dynamic require" error)
import * as nativeFs from 'fs';

/**
 * Create fs module proxy that delegates to ctx.runtime.fs
 *
 * Supports:
 * - fs.promises.* (async API) - full implementation
 * - fs callback API - emulated via promises
 * - fs.*Sync (sync API) - fallback to native fs with warnings (compat mode only)
 * - No other fallback holes - everything explicitly defined
 */
export function createFsProxy(fsShim: FSShim, options?: { allowSyncFallback?: boolean }): any {
  const allowSyncFallback = options?.allowSyncFallback ?? false;

  // Use native fs for sync fallback (only in compat mode)
  const originalFs = allowSyncFallback ? nativeFs : null;

  // Rate-limit warnings: only warn once per sync method to avoid spam
  const warnedMethods = new Set<string>();

  const syncNotSupported = (method: string) => {
    throw new Error(
      `[SANDBOX] fs.${method}() sync API not supported.\n` +
        `Use async ctx.runtime.fs.${method.replace('Sync', '')}() instead.`
    );
  };

  const syncFallback = (method: string, fn: (fs: typeof nativeFs) => any) => {
    if (allowSyncFallback && originalFs) {
      // Warn only once per method (rate-limiting)
      if (!warnedMethods.has(method)) {
        warnedMethods.add(method);
        console.warn(
          `⚠️  [COMPAT] fs.${method}() uses native fs (not governed by sandbox policy).` +
          `\n   Plugin or library code bypasses permission checks and audit logging.` +
          `\n   Consider migrating to: await ctx.runtime.fs.${method.replace('Sync', '')}()` +
          `\n   For full security guarantees, use containerprocess mode (future).`
        );
      }
      return fn(originalFs); // Pass originalFs to lambda, guaranteed non-null here
    }
    return syncNotSupported(method);
  };

  const notSupported = (method: string) => {
    throw new Error(
      `[SANDBOX] fs.${method}() is not supported.\n` +
        `Use ctx.runtime.fs methods instead. Available methods:\n` +
        `  - readFile, writeFile, mkdir, readdir, stat, exists, rm, copy, move`
    );
  };

  return {
    // Promises API (primary supported API)
    promises: {
      readFile: async (path: string, options?: any) => {
        // Handle both string encoding and options object
        const encoding = typeof options === 'string' ? options : options?.encoding || 'utf-8';
        if (encoding === null || encoding === undefined) {
          // Buffer mode
          return Buffer.from(await fsShim.readFileBuffer(path));
        }
        return fsShim.readFile(path, encoding as BufferEncoding);
      },
      writeFile: (path: string, content: string | Uint8Array, options?: any) => {
        return fsShim.writeFile(path, content, options);
      },
      appendFile: (path: string, content: string | Uint8Array, options?: any) => {
        return fsShim.writeFile(path, content, { ...options, append: true });
      },
      mkdir: (path: string, options?: any) => {
        return fsShim.mkdir(path, options);
      },
      readdir: async (path: string, options?: any) => {
        if (options?.withFileTypes) {
          // Return DirEntry objects from fsShim directly
          return fsShim.readdirWithStats(path);
        }
        return fsShim.readdir(path);
      },
      stat: async (path: string) => {
        // Return stats from fsShim directly - no wrapping
        return fsShim.stat(path);
      },
      lstat: async (path: string) => {
        // No symlink support in sandbox, treat as regular stat
        return fsShim.stat(path);
      },
      rm: (path: string, options?: any) => {
        return fsShim.rm(path, options);
      },
      rmdir: (path: string, options?: any) => {
        return fsShim.rm(path, { ...options, recursive: true });
      },
      unlink: (path: string) => {
        return fsShim.rm(path, { force: false });
      },
      copyFile: async (src: string, dest: string) => {
        return fsShim.copy(src, dest);
      },
      rename: (src: string, dest: string) => {
        return fsShim.move(src, dest);
      },
      access: async (path: string) => {
        const exists = await fsShim.exists(path);
        if (!exists) {
          const err: any = new Error(`ENOENT: no such file or directory, access '${path}'`);
          err.code = 'ENOENT';
          err.errno = -2;
          err.syscall = 'access';
          err.path = path;
          throw err;
        }
      },
      realpath: (path: string) => {
        return Promise.resolve(fsShim.resolve(path));
      },
      // Block unsupported async methods
      chmod: () => notSupported('promises.chmod'),
      chown: () => notSupported('promises.chown'),
      link: () => notSupported('promises.link'),
      symlink: () => notSupported('promises.symlink'),
      readlink: () => notSupported('promises.readlink'),
      truncate: () => notSupported('promises.truncate'),
      ftruncate: () => notSupported('promises.ftruncate'),
      utimes: () => notSupported('promises.utimes'),
      open: () => notSupported('promises.open'),
    },

    // Callback API - emulate via promises (for legacy library compatibility)
    readFile: (path: string, options: any, callback?: any) => {
      if (typeof options === 'function') {
        callback = options;
        options = 'utf-8';
      }
      const encoding = typeof options === 'string' ? options : options?.encoding || 'utf-8';
      fsShim.readFile(path, encoding as BufferEncoding)
        .then(data => callback?.(null, data))
        .catch(err => callback?.(err, null));
    },
    writeFile: (path: string, content: string | Uint8Array, options: any, callback?: any) => {
      if (typeof options === 'function') {
        callback = options;
        options = {};
      }
      fsShim.writeFile(path, content, options)
        .then(() => callback?.(null))
        .catch(err => callback?.(err));
    },
    appendFile: (path: string, content: string | Uint8Array, options: any, callback?: any) => {
      if (typeof options === 'function') {
        callback = options;
        options = {};
      }
      fsShim.writeFile(path, content, { ...options, append: true })
        .then(() => callback?.(null))
        .catch(err => callback?.(err));
    },
    mkdir: (path: string, options: any, callback?: any) => {
      if (typeof options === 'function') {
        callback = options;
        options = {};
      }
      fsShim.mkdir(path, options)
        .then(() => callback?.(null))
        .catch(err => callback?.(err));
    },
    readdir: (path: string, options: any, callback?: any) => {
      if (typeof options === 'function') {
        callback = options;
        options = {};
      }
      fsShim.readdir(path)
        .then(files => callback?.(null, files))
        .catch(err => callback?.(err, null));
    },
    stat: (path: string, callback: any) => {
      fsShim.stat(path)
        .then(stats => callback?.(null, stats))
        .catch(err => callback?.(err, null));
    },
    lstat: (path: string, callback: any) => {
      // No symlink support, use regular stat
      fsShim.stat(path)
        .then(stats => callback?.(null, stats))
        .catch(err => callback?.(err, null));
    },
    rm: (path: string, options: any, callback?: any) => {
      if (typeof options === 'function') {
        callback = options;
        options = {};
      }
      fsShim.rm(path, options)
        .then(() => callback?.(null))
        .catch(err => callback?.(err));
    },
    rmdir: (path: string, options: any, callback?: any) => {
      if (typeof options === 'function') {
        callback = options;
        options = {};
      }
      fsShim.rm(path, { ...options, recursive: true })
        .then(() => callback?.(null))
        .catch(err => callback?.(err));
    },
    unlink: (path: string, callback: any) => {
      fsShim.rm(path, { force: false })
        .then(() => callback?.(null))
        .catch(err => callback?.(err));
    },
    copyFile: (src: string, dest: string, callback: any) => {
      fsShim.copy(src, dest)
        .then(() => callback?.(null))
        .catch(err => callback?.(err));
    },
    rename: (src: string, dest: string, callback: any) => {
      fsShim.move(src, dest)
        .then(() => callback?.(null))
        .catch(err => callback?.(err));
    },
    access: (path: string, mode: number | any, callback?: any) => {
      if (typeof mode === 'function') {
        callback = mode;
      }
      fsShim.exists(path)
        .then(exists => {
          if (!exists) {
            const err: any = new Error(`ENOENT: no such file or directory, access '${path}'`);
            err.code = 'ENOENT';
            callback?.(err);
          } else {
            callback?.(null);
          }
        })
        .catch(err => callback?.(err));
    },

    // Sync API - fallback to native fs in compat mode (for third-party libraries)
    readFileSync: (path: string, options?: any) =>
      syncFallback('readFileSync', (fs) => fs.readFileSync(path, options)),
    writeFileSync: (path: string, content: string | Uint8Array, options?: any) =>
      syncFallback('writeFileSync', (fs) => fs.writeFileSync(path, content, options)),
    appendFileSync: (path: string, content: string | Uint8Array, options?: any) =>
      syncFallback('appendFileSync', (fs) => fs.appendFileSync(path, content, options)),
    mkdirSync: (path: string, options?: any) =>
      syncFallback('mkdirSync', (fs) => fs.mkdirSync(path, options)),
    readdirSync: (path: string, options?: any) =>
      syncFallback('readdirSync', (fs) => fs.readdirSync(path, options)),
    statSync: (path: string) =>
      syncFallback('statSync', (fs) => fs.statSync(path)),
    lstatSync: (path: string) =>
      syncFallback('lstatSync', (fs) => fs.lstatSync(path)),
    existsSync: (path: string) =>
      syncFallback('existsSync', (fs) => fs.existsSync(path)),
    rmSync: (path: string, options?: any) =>
      syncFallback('rmSync', (fs) => fs.rmSync(path, options)),
    rmdirSync: (path: string, options?: any) =>
      syncFallback('rmdirSync', (fs) => fs.rmdirSync(path, options)),
    unlinkSync: (path: string) =>
      syncFallback('unlinkSync', (fs) => fs.unlinkSync(path)),
    copyFileSync: (src: string, dest: string, flags?: number) =>
      syncFallback('copyFileSync', (fs) => fs.copyFileSync(src, dest, flags)),
    renameSync: (oldPath: string, newPath: string) =>
      syncFallback('renameSync', (fs) => fs.renameSync(oldPath, newPath)),
    accessSync: (path: string, mode?: number) =>
      syncFallback('accessSync', (fs) => fs.accessSync(path, mode)),
    realpathSync: (path: string) =>
      syncFallback('realpathSync', (fs) => fs.realpathSync(path)),

    // Watch APIs - not supported
    watch: () => notSupported('watch'),
    watchFile: () => notSupported('watchFile'),
    unwatchFile: () => notSupported('unwatchFile'),

    // Stream APIs - not supported (use promises instead)
    createReadStream: () => notSupported('createReadStream'),
    createWriteStream: () => notSupported('createWriteStream'),

    // Constants (pass through from real fs)
    constants: {
      F_OK: 0,
      R_OK: 4,
      W_OK: 2,
      X_OK: 1,
      // File mode constants
      S_IFMT: 0o170000,
      S_IFREG: 0o100000,
      S_IFDIR: 0o040000,
      S_IFCHR: 0o020000,
      S_IFBLK: 0o060000,
      S_IFIFO: 0o010000,
      S_IFLNK: 0o120000,
      S_IFSOCK: 0o140000,
      // File permissions
      S_IRWXU: 0o0700,
      S_IRUSR: 0o0400,
      S_IWUSR: 0o0200,
      S_IXUSR: 0o0100,
      S_IRWXG: 0o0070,
      S_IRGRP: 0o0040,
      S_IWGRP: 0o0020,
      S_IXGRP: 0o0010,
      S_IRWXO: 0o0007,
      S_IROTH: 0o0004,
      S_IWOTH: 0o0002,
      S_IXOTH: 0o0001,
    },
  };
}

/**
 * Create http/https module proxy that delegates to ctx.runtime.fetch
 *
 * Supports:
 * - http.get() / https.get() (basic emulation)
 * - http.request() / https.request() (basic emulation)
 * - Blocks server APIs (createServer, Server)
 * - No fallback holes - everything explicitly defined
 *
 * Note: Only basic functionality. Complex use cases should migrate to fetch().
 */
export function createHttpProxy(fetchShim: FetchShim, protocol: 'http' | 'https'): any {
  const notSupported = (method: string) => {
    throw new Error(
      `[SANDBOX] ${protocol}.${method}() is not supported.\n` +
        `Use ctx.runtime.fetch() instead for full control.`
    );
  };

  /**
   * Emulate IncomingMessage from fetch Response
   */
  class FakeIncomingMessage {
    statusCode: number;
    statusMessage: string;
    headers: Record<string, string | string[]>;
    httpVersion: string = '1.1';
    httpVersionMajor: number = 1;
    httpVersionMinor: number = 1;
    private _body: string;
    private _dataEmitted: boolean = false;

    constructor(response: Response, body: string) {
      this.statusCode = response.status;
      this.statusMessage = response.statusText;
      this.headers = {};
      response.headers.forEach((value, key) => {
        this.headers[key] = value;
      });
      this._body = body;
    }

    on(event: string, handler: any): this {
      if (event === 'data' && !this._dataEmitted) {
        this._dataEmitted = true;
        setImmediate(() => handler(Buffer.from(this._body)));
      } else if (event === 'end') {
        setImmediate(() => handler());
      } else if (event === 'error') {
        // No error in successful case
      }
      return this;
    }

    once(event: string, handler: any): this {
      return this.on(event, handler);
    }

    setEncoding(_encoding: string): this {
      // Ignored - we always return Buffer
      return this;
    }

    pipe(_destination: any): any {
      throw new Error('[SANDBOX] http.IncomingMessage.pipe() not supported. Use fetch() instead.');
    }
  }

  /**
   * Emulate ClientRequest
   */
  class FakeClientRequest {
    private _headers: Record<string, string> = {};
    private _body: string = '';
    private _callback: any;

    setHeader(name: string, value: string): this {
      this._headers[name] = value;
      return this;
    }

    getHeader(name: string): string | undefined {
      return this._headers[name];
    }

    removeHeader(name: string): this {
      delete this._headers[name];
      return this;
    }

    write(chunk: string | Buffer): boolean {
      this._body += chunk.toString();
      return true;
    }

    end(callback?: any): this {
      if (callback) {this._callback = callback;}
      // Trigger the request (this should be set by request() method)
      if (this._callback) {
        this._callback();
      }
      return this;
    }

    on(_event: string, _handler: any): this {
      // Ignore events - we don't support them properly
      return this;
    }

    once(event: string, handler: any): this {
      return this.on(event, handler);
    }

    abort(): void {
      // No-op
    }
  }

  return {
    // http.get() / https.get()
    get: (url: string | URL, options?: any, callback?: any) => {
      console.warn(
        `⚠️  [DEPRECATED] Direct ${protocol}.get(). Use ctx.runtime.fetch() instead.`
      );

      // Handle overloads: get(url, callback) or get(url, options, callback)
      if (typeof options === 'function') {
        callback = options;
        options = {};
      }

      const urlStr = typeof url === 'string' ? url : url.toString();
      const headers: Record<string, string> = {};

      // Extract headers from options
      if (options?.headers) {
        Object.assign(headers, options.headers);
      }

      fetchShim(urlStr, { method: 'GET', headers })
        .then(async (response) => {
          const body = await response.text();
          const fakeResponse = new FakeIncomingMessage(response, body);
          if (callback) {callback(fakeResponse);}
        })
        .catch((err) => {
          console.error(`[SANDBOX] ${protocol}.get() failed:`, err);
          // Emit error event (but we don't have proper EventEmitter)
          // Just call callback with null response
          if (callback) {
            const fakeError: any = new Error(err.message);
            fakeError.code = 'ECONNREFUSED';
            callback(fakeError);
          }
        });

      // Return fake ClientRequest
      return new FakeClientRequest();
    },

    // http.request() / https.request()
    request: (url: string | URL, options?: any, callback?: any) => {
      console.warn(
        `⚠️  [DEPRECATED] Direct ${protocol}.request(). Use ctx.runtime.fetch() instead.`
      );

      // Handle overloads: request(url, callback) or request(url, options, callback)
      if (typeof options === 'function') {
        callback = options;
        options = {};
      }

      const urlStr = typeof url === 'string' ? url : url.toString();
      const method = options?.method || 'GET';
      const headers: Record<string, string> = {};

      if (options?.headers) {
        Object.assign(headers, options.headers);
      }

      const req = new FakeClientRequest();

      // Override end() to trigger the actual fetch
      const originalEnd = req.end.bind(req);
      req.end = function (callback?: any): any {
        fetchShim(urlStr, { method, headers, body: (req as any)._body || undefined })
          .then(async (response) => {
            const body = await response.text();
            const fakeResponse = new FakeIncomingMessage(response, body);
            if (callback) {callback(fakeResponse);}
          })
          .catch((err) => {
            console.error(`[SANDBOX] ${protocol}.request() failed:`, err);
            if (callback) {
              const fakeError: any = new Error(err.message);
              fakeError.code = 'ECONNREFUSED';
              callback(fakeError);
            }
          });

        if (callback) {originalEnd(callback);}
        return this;
      };

      if (callback) {
        // Set callback for response
        (req as any)._callback = callback;
      }

      return req;
    },

    // Agent class (not supported)
    Agent: class FakeAgent {
      constructor() {
        throw new Error(`[SANDBOX] ${protocol}.Agent not supported. Use fetch() instead.`);
      }
    },
    globalAgent: {
      // Fake agent for libraries that check for it
      maxSockets: 5,
      maxFreeSockets: 2,
    },

    // Server APIs - not supported
    createServer: () => notSupported('createServer'),
    Server: class FakeServer {
      constructor() {
        throw new Error(`[SANDBOX] ${protocol}.Server not supported. Plugins cannot create servers.`);
      }
    },

    // Constants
    METHODS: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'],
    STATUS_CODES: {
      200: 'OK',
      201: 'Created',
      204: 'No Content',
      400: 'Bad Request',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'Not Found',
      500: 'Internal Server Error',
    },

    // Not supported methods
    validateHeaderName: () => notSupported('validateHeaderName'),
    validateHeaderValue: () => notSupported('validateHeaderValue'),
    setMaxIdleHTTPParsers: () => notSupported('setMaxIdleHTTPParsers'),
  };
}

/**
 * Create path module proxy that delegates to ctx.runtime.fs path utilities
 *
 * Full support for common path operations.
 */
export function createPathProxy(fsShim: FSShim): any {
  return {
    join: (...segments: string[]) => fsShim.join(...segments),
    resolve: (path: string) => fsShim.resolve(path),
    dirname: (path: string) => fsShim.dirname(path),
    basename: (path: string, ext?: string) => fsShim.basename(path, ext),
    extname: (path: string) => fsShim.extname(path),
    relative: (path: string) => fsShim.relative(path),

    // Path separators (platform-specific)
    sep: '/',
    delimiter: ':',

    // Not implemented (rarely used)
    parse: () => {
      throw new Error('[SANDBOX] path.parse() not supported. Use individual methods.');
    },
    format: () => {
      throw new Error('[SANDBOX] path.format() not supported. Use individual methods.');
    },
  };
}

/**
 * Create child_process module proxy that delegates to ctx.platform.shell
 *
 * Supports:
 * - exec() - basic emulation via shell.exec()
 * - execSync() - blocked (sync not supported)
 * - spawn(), fork(), execFile() - limited support
 * - No fallback holes - everything explicitly defined
 *
 * Note: This is a compatibility shim. Complex use cases should migrate to ctx.platform.shell.exec().
 */
export function createChildProcessProxy(shellAPI: ShellAPI): any {
  const notSupported = (method: string) => {
    throw new Error(
      `[SANDBOX] child_process.${method}() is not supported.\n` +
        `Use ctx.platform.shell.exec() instead.\n` +
        `Example: await ctx.platform.shell.exec('git', ['status'])`
    );
  };

  const syncNotSupported = (method: string) => {
    throw new Error(
      `[SANDBOX] child_process.${method}() sync API not supported.\n` +
        `Use async ctx.platform.shell.exec() instead.`
    );
  };

  /**
   * Fake ChildProcess class
   */
  class FakeChildProcess extends EventEmitter {
    stdin: any = null;
    stdout: any = null;
    stderr: any = null;
    pid: number = Math.floor(Math.random() * 100000);
    exitCode: number | null = null;
    signalCode: string | null = null;
    killed: boolean = false;

    constructor() {
      super();
      // No streams in sandbox mode
    }

    kill(_signal?: string): boolean {
      this.killed = true;
      this.exitCode = 1;
      this.signalCode = 'SIGTERM';
      setImmediate(() => this.emit('exit', 1, 'SIGTERM'));
      return true;
    }

    send(_message: any): boolean {
      throw new Error('[SANDBOX] child_process IPC not supported');
    }

    disconnect(): void {
      // No-op
    }

    unref(): void {
      // No-op
    }

    ref(): void {
      // No-op
    }
  }

  return {
    /**
     * exec() - Execute command via shell
     *
     * Maps to ctx.platform.shell.exec()
     */
    exec: (
      command: string,
      options?: any,
      callback?: (error: Error | null, stdout: string, stderr: string) => void
    ) => {
      console.warn(
        `⚠️  [DEPRECATED] Direct child_process.exec(). Use ctx.platform.shell.exec() instead.`
      );

      // Handle overloads: exec(command, callback) or exec(command, options, callback)
      if (typeof options === 'function') {
        callback = options;
        options = {};
      }

      const cwd = options?.cwd;
      const env = options?.env;
      const timeout = options?.timeout;

      // Parse command into program + args (basic shell parsing)
      const parts = command.trim().split(/\s+/).filter(Boolean);
      if (parts.length === 0) {
        if (callback) {
          callback(new Error('Empty command'), '', '');
        }
        return new FakeChildProcess();
      }

      const program = parts[0]!; // Safe: we checked parts.length > 0
      const args = parts.slice(1);

      shellAPI
        .exec(program, args, { cwd, env, timeout, throwOnError: false })
        .then((result) => {
          if (callback) {
            const error = result.ok ? null : new Error(`Command failed with exit code ${result.code}`);
            callback(error, result.stdout, result.stderr);
          }
        })
        .catch((err) => {
          if (callback) {
            callback(err, '', '');
          }
        });

      // Return fake ChildProcess
      return new FakeChildProcess();
    },

    /**
     * spawn() - Spawn process
     *
     * Limited emulation via shell.exec()
     */
    spawn: (command: string, args?: string[], options?: any) => {
      console.warn(
        `⚠️  [DEPRECATED] Direct child_process.spawn(). Use ctx.platform.shell.exec() instead.`
      );

      const cwd = options?.cwd;
      const env = options?.env;
      const timeout = options?.timeout;

      const proc = new FakeChildProcess();

      // Execute via shell.exec()
      shellAPI
        .exec(command, args || [], { cwd, env, timeout, throwOnError: false })
        .then((result) => {
          proc.exitCode = result.code;
          proc.emit('exit', result.code, null);
          proc.emit('close', result.code, null);
        })
        .catch((err) => {
          proc.exitCode = 1;
          proc.emit('error', err);
          proc.emit('exit', 1, null);
        });

      return proc;
    },

    /**
     * execFile() - Execute file
     *
     * Maps to shell.exec()
     */
    execFile: (
      file: string,
      args?: string[] | any,
      options?: any,
      callback?: (error: Error | null, stdout: string, stderr: string) => void
    ) => {
      console.warn(
        `⚠️  [DEPRECATED] Direct child_process.execFile(). Use ctx.platform.shell.exec() instead.`
      );

      // Handle overloads
      if (typeof args === 'function') {
        callback = args;
        args = [];
        options = {};
      } else if (typeof options === 'function') {
        callback = options;
        options = {};
      }

      const cwd = options?.cwd;
      const env = options?.env;
      const timeout = options?.timeout;

      shellAPI
        .exec(file, args || [], { cwd, env, timeout, throwOnError: false })
        .then((result) => {
          if (callback) {
            const error = result.ok ? null : new Error(`Command failed with exit code ${result.code}`);
            callback(error, result.stdout, result.stderr);
          }
        })
        .catch((err) => {
          if (callback) {
            callback(err, '', '');
          }
        });

      return new FakeChildProcess();
    },

    /**
     * fork() - Not supported (Node.js process forking not allowed)
     */
    fork: () => notSupported('fork'),

    /**
     * Sync methods - not supported
     */
    execSync: () => syncNotSupported('execSync'),
    execFileSync: () => syncNotSupported('execFileSync'),
    spawnSync: () => syncNotSupported('spawnSync'),

    /**
     * ChildProcess class
     */
    ChildProcess: FakeChildProcess,
  };
}
