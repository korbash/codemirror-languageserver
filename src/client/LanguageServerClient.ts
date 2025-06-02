import * as LSP from 'vscode-languageserver-protocol';
import { RequestManager, Client } from '@open-rpc/client-js';
import { Transport } from '@open-rpc/client-js/build/transports/Transport';
import {
    LSPRequestMap,
    LSPNotifyMap,
    Notification,
    LanguageServerClientOptions,
} from '../types/lsp';

const timeout = 10000;

export class LanguageServerClient<TInitOptions = unknown> {
    public ready: boolean = false;
    public capabilities: LSP.ServerCapabilities = {};
    public initializePromise: Promise<void>;

    private rootUri: string | null;
    private workspaceFolders: LSP.WorkspaceFolder[] | null;
    private autoClose: boolean = false;

    private transport: any;
    private requestManager: RequestManager;
    private client: Client;

    private plugins: any[] = [];
    private options: LanguageServerClientOptions<TInitOptions>;

    constructor(options: LanguageServerClientOptions<TInitOptions>) {
        this.options = options;
        this.rootUri = options.rootUri;
        this.workspaceFolders = options.workspaceFolders;
        this.autoClose = options.autoClose || false;
        this.transport = options.transport;

        this.requestManager = new RequestManager([this.transport]);
        this.client = new Client(this.requestManager);

        this.client.onNotification((data) => {
            this.processNotification(data as any);
        });

        // Handle WebSocket-specific logic if needed
        const webSocketTransport = this.transport as any;
        if (webSocketTransport && webSocketTransport.connection) {
            // XXX(hjr265): Need a better way to do this. Relevant issue:
            // https://github.com/FurqanSoftware/codemirror-languageserver/issues/9
            webSocketTransport.connection.addEventListener(
                'message',
                (message: MessageEvent) => {
                    const data = JSON.parse(message.data);
                    if (data.method && data.id) {
                        webSocketTransport.connection.send(
                            JSON.stringify({
                                jsonrpc: '2.0',
                                id: data.id,
                                result: null,
                            }),
                        );
                    }
                },
            );
        }

        this.initializePromise = this.initialize();
    }

    protected getInitializationOptions(): LSP.InitializeParams {
        return {
            processId: null,
            clientInfo: {
                name: 'codemirror-languageserver',
                version: '1.0.0',
            },
            rootUri: this.rootUri,
            initializationOptions: this.options.initializationOptions ?? null,
            capabilities: {
                general: {
                    regularExpressions: {
                        engine: 'ECMAScript',
                        version: 'ES2020',
                    },
                    markdown: {
                        parser: 'marked',
                        version: '4.0.10',
                    },
                },
                textDocument: {
                    synchronization: {
                        dynamicRegistration: false,
                        willSave: false,
                        willSaveWaitUntil: false,
                        didSave: false,
                    },
                    completion: {
                        dynamicRegistration: false,
                        completionItem: {
                            snippetSupport: false,
                            commitCharactersSupport: false,
                            documentationFormat: ['markdown', 'plaintext'],
                            deprecatedSupport: false,
                            preselectSupport: false,
                            tagSupport: {
                                valueSet: [1],
                            },
                            insertReplaceSupport: false,
                            resolveSupport: {
                                properties: [
                                    'documentation',
                                    'detail',
                                    'additionalTextEdits',
                                ],
                            },
                            insertTextModeSupport: {
                                valueSet: [1, 2],
                            },
                        },
                        completionItemKind: {
                            valueSet: [
                                1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14,
                                15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25,
                            ],
                        },
                        contextSupport: true,
                    },
                    hover: {
                        dynamicRegistration: false,
                        contentFormat: ['markdown', 'plaintext'],
                    },
                },
                workspace: {
                    applyEdit: false,
                    workspaceEdit: {
                        documentChanges: false,
                        resourceOperations: ['create', 'rename', 'delete'],
                        failureHandling: 'textOnlyTransactional',
                    },
                    didChangeConfiguration: {
                        dynamicRegistration: false,
                    },
                    didChangeWatchedFiles: {
                        dynamicRegistration: false,
                    },
                    symbol: {
                        dynamicRegistration: false,
                        symbolKind: {
                            valueSet: [
                                1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14,
                                15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26,
                            ],
                        },
                    },
                    executeCommand: {
                        dynamicRegistration: false,
                    },
                    configuration: true,
                    workspaceFolders: true,
                },
            },
            trace: 'off',
            workspaceFolders: this.workspaceFolders,
        };
    }

    public async initialize(): Promise<void> {
        const params = this.getInitializationOptions();
        const initializeResult = await this.request(
            'initialize',
            params,
            timeout,
        );
        this.capabilities = initializeResult.capabilities;
        this.ready = true;
        await this.notify('initialized', {});
    }

    public close(): void {
        if (this.transport && typeof this.transport.close === 'function') {
            this.transport.close();
        }
    }

    public textDocumentDidOpen(params: LSP.DidOpenTextDocumentParams) {
        return this.notify('textDocument/didOpen', params);
    }

    public textDocumentDidChange(params: LSP.DidChangeTextDocumentParams) {
        return this.notify('textDocument/didChange', params);
    }

    public async textDocumentHover(params: LSP.HoverParams) {
        return await this.request('textDocument/hover', params, timeout);
    }

    public async textDocumentCompletion(params: LSP.CompletionParams) {
        return await this.request('textDocument/completion', params, timeout);
    }

    public attachPlugin(plugin: any) {
        this.plugins.push(plugin);
    }

    public detachPlugin(plugin: any) {
        const i = this.plugins.indexOf(plugin);
        if (i === -1) {
            return;
        }
        this.plugins.splice(i, 1);
        if (this.autoClose && this.plugins.length === 0) {
            this.close();
        }
    }

    // Public API for any LSP requests
    public sendRequest<T = any>(
        method: string,
        params?: any,
        requestTimeout: number = timeout,
    ): Promise<T> {
        return this.client.request({ method, params }, requestTimeout);
    }

    // Public API for any LSP notifications
    public sendNotification(method: string, params?: any): Promise<any> {
        return this.client.notify({ method, params });
    }

    // Typed versions for known methods
    public request<K extends keyof LSPRequestMap>(
        method: K,
        params: LSPRequestMap[K][0],
        requestTimeout: number = timeout,
    ): Promise<LSPRequestMap[K][1]> {
        return this.client.request({ method, params }, requestTimeout);
    }

    public notify<K extends keyof LSPNotifyMap>(
        method: K,
        params: LSPNotifyMap[K],
    ): Promise<LSPNotifyMap[K]> {
        return this.client.notify({ method, params });
    }

    protected processNotification(notification: Notification) {
        for (const plugin of this.plugins) {
            if (plugin.processNotification) {
                plugin.processNotification(notification);
            }
        }
    }
}
