/**
 * Ultra-minimal Language Server Protocol Client
 * - WebSocket auto-connects on creation
 * - LSP initializes automatically on WebSocket open
 * - No subscription management
 * - Only request/notification sending
 */

import { createConnection, Connection } from 'vscode-languageserver/node.js';
import ReconnectingWebSocket from 'reconnecting-websocket';
import * as WS from 'ws';
import { BehaviorSubject, Subject, Observable } from 'rxjs';
import { distinctUntilChanged, takeUntil, filter } from 'rxjs/operators';

import { WebSocketMessageReader } from '../transport/WebSocketMessageReader.js';
import { WebSocketMessageWriter } from '../transport/WebSocketMessageWriter.js';
import { RequestManager } from './RequestManager.js';

import type {
    InitializeParams,
    InitializeResult,
    ServerCapabilities,
} from 'vscode-languageserver-protocol';

import { ServerState } from '../types/index.js';
import type { LanguageServerOptions, RequestOptions } from '../types/index.js';

export interface LanguageClientOptions extends LanguageServerOptions {
    wsUrl: string;
    maxRetries?: number;
    connectionTimeout?: number;
    debug?: boolean;
}

// Default LSP client capabilities constant
const DEFAULT_CLIENT_CAPABILITIES = {
    workspace: {
        applyEdit: false,
        workspaceEdit: {
            documentChanges: false,
            resourceOperations: [],
            failureHandling: 'abort' as any,
        },
        didChangeConfiguration: { dynamicRegistration: false },
        didChangeWatchedFiles: { dynamicRegistration: false },
        symbol: { dynamicRegistration: false },
        executeCommand: { dynamicRegistration: false },
        workspaceFolders: true,
        configuration: true,
    },
    textDocument: {
        synchronization: {
            dynamicRegistration: false,
            willSave: false,
            willSaveWaitUntil: false,
            didSave: true,
        },
        completion: {
            dynamicRegistration: false,
            completionItem: {
                snippetSupport: false,
                commitCharactersSupport: false,
                documentationFormat: ['plaintext'],
                deprecatedSupport: false,
                preselectSupport: false,
            },
            contextSupport: false,
        },
        hover: {
            dynamicRegistration: false,
            contentFormat: ['plaintext'] as any,
        },
        signatureHelp: {
            dynamicRegistration: false,
            signatureInformation: {
                documentationFormat: ['plaintext'],
            },
        },
        definition: { dynamicRegistration: false },
        references: { dynamicRegistration: false },
        documentHighlight: { dynamicRegistration: false },
        documentSymbol: {
            dynamicRegistration: false,
            symbolKind: {
                valueSet: [
                    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17,
                    18, 19, 20, 21, 22, 23, 24, 25, 26,
                ],
            },
        },
        codeAction: { dynamicRegistration: false },
        codeLens: { dynamicRegistration: false },
        formatting: { dynamicRegistration: false },
        rangeFormatting: { dynamicRegistration: false },
        onTypeFormatting: { dynamicRegistration: false },
        rename: { dynamicRegistration: false },
        publishDiagnostics: {
            relatedInformation: false,
            versionSupport: false,
            tagSupport: { valueSet: [1, 2] },
        },
    },
    window: {
        showMessage: {
            messageActionItem: { additionalPropertiesSupport: false },
        },
        showDocument: { support: false },
        workDoneProgress: true,
    },
    general: {
        regularExpressions: { engine: 'ECMAScript', version: 'ES2020' },
        markdown: { parser: 'marked', version: '4.0.0' },
    },
};

/**
 * Ultra-minimal LanguageClient - auto-connects and initializes
 */
export class LanguageClient {
    private readonly requestManager = new RequestManager();
    private readonly webSocket: ReconnectingWebSocket;
    private connection: Connection | null = null;
    private readonly abortController = new AbortController();

    // RxJS state management
    private readonly stateSubject = new BehaviorSubject<ServerState>(
        ServerState.Stopped,
    );
    private _capabilities: ServerCapabilities | null = null;
    private readonly capabilitiesSubject =
        new BehaviorSubject<ServerCapabilities | null>(null);
    private readonly errorSubject = new Subject<Error>();
    private readonly destroySubject = new Subject<void>();

    // Public observables
    public readonly state$ = this.stateSubject
        .asObservable()
        .pipe(distinctUntilChanged(), takeUntil(this.destroySubject));

    public readonly capabilities$ = this.capabilitiesSubject
        .asObservable()
        .pipe(distinctUntilChanged(), takeUntil(this.destroySubject));

    public readonly error$ = this.errorSubject
        .asObservable()
        .pipe(takeUntil(this.destroySubject));

    public readonly isReady$ = this.state$.pipe(
        filter((state) => state === ServerState.Running),
    );

    // Convenience properties

    get abortSignal(): AbortSignal {
        return this.abortController.signal;
    }

    get capabilities(): ServerCapabilities | null {
        return this._capabilities;
    }

    constructor(private readonly options: LanguageClientOptions) {
        // Create WebSocket and auto-connect
        this.webSocket = new ReconnectingWebSocket(this.options.wsUrl, [], {
            WebSocket: WS,
            maxRetries: this.options.maxRetries ?? 10,
            connectionTimeout: this.options.connectionTimeout ?? 10000,
            debug: this.options.debug ?? false,
        });

        // Set up WebSocket callbacks
        this.webSocket.addEventListener('open', () => this.onWebSocketOpen());
        this.webSocket.addEventListener('close', () => this.onWebSocketClose());
        this.webSocket.addEventListener('error', (event) =>
            this.onWebSocketError(event),
        );

        // Start connecting immediately
        this.stateSubject.next(ServerState.Connecting);
    }

    /**
     * Send a generic LSP request
     */
    async request<T>(
        method: string,
        params: any,
        options?: RequestOptions,
    ): Promise<T> {
        const { abortSignal: externalSignal, ...restOptions } = options ?? {};
        const abortSignal = externalSignal
            ? AbortSignal.any([externalSignal, this.abortSignal])
            : this.abortSignal;

        const resultPromise = this.requestManager.sendRequest(
            this.connection!,
            method as any,
            params,
            { ...restOptions, abortSignal },
        );

        const result = await resultPromise.promise;
        if (result.isOk()) {
            return result.unwrap() as T;
        } else {
            throw result.unwrapErr()[0] || new Error('Request failed');
        }
    }

    /**
     * Send a generic LSP notification
     */
    async sendNotification(method: string, params: any): Promise<void> {
        try {
            this.connection!.sendNotification(method, params);
        } catch (error) {
            // Ignore notification errors
        }
    }

    /**
     * Symbol.dispose for using with `using` keyword
     */
    [Symbol.dispose](): void {
        this.abortController.abort('Client disposed');
        this.webSocket.close();
    }

    // === Private Methods ===

    /**
     * Handle WebSocket open event - perform LSP initialization
     */
    private onWebSocketOpen(): void {
        try {
            // Create LSP connection
            const reader = new WebSocketMessageReader(this.webSocket as any);
            const writer = new WebSocketMessageWriter(this.webSocket as any);
            this.connection = createConnection(reader, writer);

            // Start listening
            this.connection.listen();

            // Initialize LSP asynchronously
            this.performInitialization().catch((error) => {
                this.stateSubject.next(ServerState.Error);
                const errorObj =
                    error instanceof Error ? error : new Error(String(error));
                this.errorSubject.next(errorObj);
            });
        } catch (error) {
            this.stateSubject.next(ServerState.Error);
            const errorObj =
                error instanceof Error ? error : new Error(String(error));
            this.errorSubject.next(errorObj);
        }
    }

    /**
     * Handle WebSocket close event - reset state and cancel requests
     */
    private onWebSocketClose(): void {
        this.connection = null;
        this.requestManager.cancelAll('Connection lost');
        this._capabilities = null;
        this.capabilitiesSubject.next(null);
        this.stateSubject.next(ServerState.Stopped);
    }

    /**
     * Handle WebSocket error event
     */
    private onWebSocketError(event: any): void {
        const error = new Error(
            `WebSocket error: ${event.message || 'Unknown error'}`,
        );
        this.errorSubject.next(error);
    }

    /**
     * Perform LSP initialization
     */
    private async performInitialization(): Promise<void> {
        this.stateSubject.next(ServerState.Initializing);

        const initializeParams: InitializeParams = {
            processId: null,
            rootUri: this.options.rootUri,
            workspaceFolders: this.options.workspaceFolders?.map((uri) => ({
                uri,
                name: uri.split('/').pop() || uri,
            })),
            capabilities: DEFAULT_CLIENT_CAPABILITIES,
            initializationOptions: this.options.initializationOptions,
        };

        const result = await this.request<InitializeResult>(
            'initialize',
            initializeParams,
        );

        this._capabilities = result.capabilities;
        this.capabilitiesSubject.next(result.capabilities);
        await this.sendNotification('initialized', {});
        this.stateSubject.next(ServerState.Running);
    }

    /**
     * Close LSP connection
     */
    private closeConnection(): void {
        if (this.connection) {
            try {
                this.connection.dispose();
            } catch (error) {
                // Ignore disposal errors
            }
            this.connection = null;
        }
    }
}
