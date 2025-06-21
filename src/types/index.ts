/**
 * Type definitions for the LSP client.
 *
 * This module re-exports all Microsoft vscode-languageserver-protocol types
 * and adds our Zed-style extensions for better developer experience.
 */

// === Microsoft LSP Types (complete re-export) ===
export * from 'vscode-languageserver-protocol';

// === Our Extensions ===
export { Result, Ok, Err, AsyncResult } from 'ts-results-es';
export * from './Subscription.js';
export * from './ErrorConverter.js';

// === Convenience type aliases ===
import type {
    CompletionParams,
    CompletionList,
    CompletionItem,
    HoverParams,
    Hover,
    DefinitionParams,
    Definition,
    ReferenceParams,
    Location,
    DocumentSymbolParams,
    DocumentSymbol,
    SymbolInformation,
    InitializeParams,
    InitializeResult,
    DidOpenTextDocumentParams,
    DidChangeTextDocumentParams,
    DidCloseTextDocumentParams,
    PublishDiagnosticsParams,
    CancellationToken,
    MessageReader,
    MessageWriter,
    NotificationType,
    RequestType,
    ProtocolRequestType,
    ProtocolNotificationType,
} from 'vscode-languageserver-protocol';

import type { Result } from 'ts-results-es';
import type { Subscription, CompositeSubscription } from './Subscription.js';
import type { LSPError } from './ErrorConverter.js';

// === Handler Types ===
export type NotificationHandler<T> = (params: T) => void | Promise<void>;
export type RequestHandler<P, R> = (params: P) => R | Promise<R>;
export type ProgressHandler = (params: any) => void;

// === Request/Response Type Map ===
export interface LSPRequestMap {
    initialize: [InitializeParams, InitializeResult];
    'textDocument/completion': [
        CompletionParams,
        CompletionList | CompletionItem[] | null,
    ];
    'textDocument/hover': [HoverParams, Hover | null];
    'textDocument/definition': [DefinitionParams, Definition | null];
    'textDocument/references': [ReferenceParams, Location[] | null];
    'textDocument/documentSymbol': [
        DocumentSymbolParams,
        DocumentSymbol[] | SymbolInformation[] | null,
    ];
}

// === Notification Type Map ===
export interface LSPNotificationMap {
    'textDocument/didOpen': DidOpenTextDocumentParams;
    'textDocument/didChange': DidChangeTextDocumentParams;
    'textDocument/didClose': DidCloseTextDocumentParams;
    'textDocument/publishDiagnostics': PublishDiagnosticsParams;
    '$/progress': any;
}

// === Options Types ===
export interface RequestOptions {
    timeout?: number;
    abortSignal?: AbortSignal;
    retries?: number;
    retryCoefficient?: number; // koff - exponential backoff multiplier
    firstTimeout?: number; // base timeout for retry calculation
}

export interface LanguageServerOptions {
    name: string;
    rootUri: string | null;
    workspaceFolders?: string[];
    initializationOptions?: any;

    // Request options
    request?: {
        timeout?: number;
        retries?: number;
    };

    // Connection options
    connection?: {
        reconnectAttempts?: number;
        reconnectDelay?: number;
    };

    // Logging options
    logging?: {
        level?: 'trace' | 'debug' | 'info' | 'warn' | 'error';
        prefix?: string;
    };
}

// === Transport Types ===
export interface Transport {
    send(message: string): Promise<void>;
    onMessage(handler: (message: string) => void): Subscription;
    onError(handler: (error: Error) => void): Subscription;
    onClose(handler: () => void): Subscription;
    close(): Promise<void>;
    isConnected(): boolean;
}

// === Server State ===
export enum ServerState {
    Initial = 'initial',
    Connecting = 'connecting',
    Initializing = 'initializing',
    Running = 'running',
    Stopping = 'stopping',
    Stopped = 'stopped',
    Error = 'error',
}

// === Performance Monitoring ===
export interface PerformanceMetrics {
    method: string;
    duration: number;
    timestamp: number;
    success: boolean;
    error?: string;
}

// === Error Types ===
// LSPError is exported from ErrorConverter.js

// === Type Guards ===
export function isResult<T, E>(value: unknown): value is Result<T, E> {
    return value instanceof Object && 'isOk' in value && 'isErr' in value;
}

export function isSubscription(value: unknown): value is Subscription {
    return value instanceof Object && 'dispose' in value && 'isActive' in value;
}

// === Auto-generated LSP Method Constants ===
// Complete enum extracted from vscode-languageserver-protocol
// Total: 67 request methods + 22 notification methods = 89 methods

// === LSP Request Methods ===
export const LSPMethods = {
    // CallHierarchy
    CALLHIERARCHY_INCOMINGCALLS: 'callHierarchy/incomingCalls',
    CALLHIERARCHY_OUTGOINGCALLS: 'callHierarchy/outgoingCalls',

    // Client
    CLIENT_REGISTERCAPABILITY: 'client/registerCapability',
    CLIENT_UNREGISTERCAPABILITY: 'client/unregisterCapability',

    // CodeAction
    CODEACTION_RESOLVE: 'codeAction/resolve',

    // CodeLens
    CODELENS_RESOLVE: 'codeLens/resolve',

    // CompletionItem
    COMPLETIONITEM_RESOLVE: 'completionItem/resolve',

    // DocumentLink
    DOCUMENTLINK_RESOLVE: 'documentLink/resolve',

    // Initialize
    INITIALIZE: 'initialize',

    // InlayHint
    INLAYHINT_RESOLVE: 'inlayHint/resolve',

    // Shutdown
    SHUTDOWN: 'shutdown',

    // TextDocument
    TEXTDOCUMENT_CODEACTION: 'textDocument/codeAction',
    TEXTDOCUMENT_CODELENS: 'textDocument/codeLens',
    TEXTDOCUMENT_COLORPRESENTATION: 'textDocument/colorPresentation',
    TEXTDOCUMENT_COMPLETION: 'textDocument/completion',
    TEXTDOCUMENT_DECLARATION: 'textDocument/declaration',
    TEXTDOCUMENT_DEFINITION: 'textDocument/definition',
    TEXTDOCUMENT_DIAGNOSTIC: 'textDocument/diagnostic',
    TEXTDOCUMENT_DOCUMENTCOLOR: 'textDocument/documentColor',
    TEXTDOCUMENT_DOCUMENTHIGHLIGHT: 'textDocument/documentHighlight',
    TEXTDOCUMENT_DOCUMENTLINK: 'textDocument/documentLink',
    TEXTDOCUMENT_DOCUMENTSYMBOL: 'textDocument/documentSymbol',
    TEXTDOCUMENT_FOLDINGRANGE: 'textDocument/foldingRange',
    TEXTDOCUMENT_FORMATTING: 'textDocument/formatting',
    TEXTDOCUMENT_HOVER: 'textDocument/hover',
    TEXTDOCUMENT_IMPLEMENTATION: 'textDocument/implementation',
    TEXTDOCUMENT_INLAYHINT: 'textDocument/inlayHint',
    TEXTDOCUMENT_INLINECOMPLETION: 'textDocument/inlineCompletion',
    TEXTDOCUMENT_INLINEVALUE: 'textDocument/inlineValue',
    TEXTDOCUMENT_LINKEDEDITINGRANGE: 'textDocument/linkedEditingRange',
    TEXTDOCUMENT_MONIKER: 'textDocument/moniker',
    TEXTDOCUMENT_ONTYPEFORMATTING: 'textDocument/onTypeFormatting',
    TEXTDOCUMENT_PREPARECALLHIERARCHY: 'textDocument/prepareCallHierarchy',
    TEXTDOCUMENT_PREPARERENAME: 'textDocument/prepareRename',
    TEXTDOCUMENT_PREPARETYPEHIERARCHY: 'textDocument/prepareTypeHierarchy',
    TEXTDOCUMENT_RANGEFORMATTING: 'textDocument/rangeFormatting',
    TEXTDOCUMENT_RANGESFORMATTING: 'textDocument/rangesFormatting',
    TEXTDOCUMENT_REFERENCES: 'textDocument/references',
    TEXTDOCUMENT_RENAME: 'textDocument/rename',
    TEXTDOCUMENT_SELECTIONRANGE: 'textDocument/selectionRange',
    TEXTDOCUMENT_SEMANTICTOKENS_FULL: 'textDocument/semanticTokens/full',
    TEXTDOCUMENT_SEMANTICTOKENS_FULL_DELTA:
        'textDocument/semanticTokens/full/delta',
    TEXTDOCUMENT_SEMANTICTOKENS_RANGE: 'textDocument/semanticTokens/range',
    TEXTDOCUMENT_SIGNATUREHELP: 'textDocument/signatureHelp',
    TEXTDOCUMENT_TYPEDEFINITION: 'textDocument/typeDefinition',
    TEXTDOCUMENT_WILLSAVEWAITUNTIL: 'textDocument/willSaveWaitUntil',

    // TypeHierarchy
    TYPEHIERARCHY_SUBTYPES: 'typeHierarchy/subtypes',
    TYPEHIERARCHY_SUPERTYPES: 'typeHierarchy/supertypes',

    // Window
    WINDOW_SHOWDOCUMENT: 'window/showDocument',
    WINDOW_SHOWMESSAGEREQUEST: 'window/showMessageRequest',
    WINDOW_WORKDONEPROGRESS_CREATE: 'window/workDoneProgress/create',

    // Workspace
    WORKSPACE_APPLYEDIT: 'workspace/applyEdit',
    WORKSPACE_CODELENS_REFRESH: 'workspace/codeLens/refresh',
    WORKSPACE_CONFIGURATION: 'workspace/configuration',
    WORKSPACE_DIAGNOSTIC: 'workspace/diagnostic',
    WORKSPACE_DIAGNOSTIC_REFRESH: 'workspace/diagnostic/refresh',
    WORKSPACE_EXECUTECOMMAND: 'workspace/executeCommand',
    WORKSPACE_FOLDINGRANGE_REFRESH: 'workspace/foldingRange/refresh',
    WORKSPACE_INLAYHINT_REFRESH: 'workspace/inlayHint/refresh',
    WORKSPACE_INLINEVALUE_REFRESH: 'workspace/inlineValue/refresh',
    WORKSPACE_SEMANTICTOKENS_REFRESH: 'workspace/semanticTokens/refresh',
    WORKSPACE_SYMBOL: 'workspace/symbol',
    WORKSPACE_WILLCREATEFILES: 'workspace/willCreateFiles',
    WORKSPACE_WILLDELETEFILES: 'workspace/willDeleteFiles',
    WORKSPACE_WILLRENAMEFILES: 'workspace/willRenameFiles',
    WORKSPACE_WORKSPACEFOLDERS: 'workspace/workspaceFolders',

    // WorkspaceSymbol
    WORKSPACESYMBOL_RESOLVE: 'workspaceSymbol/resolve',
} as const;

// === LSP Notification Methods ===
export const LSPNotifications = {
    // Exit
    EXIT: 'exit',

    // Initialized
    INITIALIZED: 'initialized',

    // NotebookDocument
    NOTEBOOKDOCUMENT_DIDCHANGE: 'notebookDocument/didChange',
    NOTEBOOKDOCUMENT_DIDCLOSE: 'notebookDocument/didClose',
    NOTEBOOKDOCUMENT_DIDOPEN: 'notebookDocument/didOpen',
    NOTEBOOKDOCUMENT_DIDSAVE: 'notebookDocument/didSave',

    // Telemetry
    TELEMETRY_EVENT: 'telemetry/event',

    // TextDocument
    TEXTDOCUMENT_DIDCHANGE: 'textDocument/didChange',
    TEXTDOCUMENT_DIDCLOSE: 'textDocument/didClose',
    TEXTDOCUMENT_DIDOPEN: 'textDocument/didOpen',
    TEXTDOCUMENT_DIDSAVE: 'textDocument/didSave',
    TEXTDOCUMENT_PUBLISHDIAGNOSTICS: 'textDocument/publishDiagnostics',
    TEXTDOCUMENT_WILLSAVE: 'textDocument/willSave',

    // Window
    WINDOW_LOGMESSAGE: 'window/logMessage',
    WINDOW_SHOWMESSAGE: 'window/showMessage',
    WINDOW_WORKDONEPROGRESS_CANCEL: 'window/workDoneProgress/cancel',

    // Workspace
    WORKSPACE_DIDCHANGECONFIGURATION: 'workspace/didChangeConfiguration',
    WORKSPACE_DIDCHANGEWATCHEDFILES: 'workspace/didChangeWatchedFiles',
    WORKSPACE_DIDCHANGEWORKSPACEFOLDERS: 'workspace/didChangeWorkspaceFolders',
    WORKSPACE_DIDCREATEFILES: 'workspace/didCreateFiles',
    WORKSPACE_DIDDELETEFILES: 'workspace/didDeleteFiles',
    WORKSPACE_DIDRENAMEFILES: 'workspace/didRenameFiles',
} as const;

// === Type-safe method unions ===
export type LSPMethodValue = (typeof LSPMethods)[keyof typeof LSPMethods];
export type LSPNotificationValue =
    (typeof LSPNotifications)[keyof typeof LSPNotifications];

// === Utility Types ===
export type LSPMethod = keyof LSPRequestMap;
export type LSPNotificationMethod = keyof LSPNotificationMap;

export type ExtractParams<T extends LSPMethod> = LSPRequestMap[T][0];
export type ExtractResult<T extends LSPMethod> = LSPRequestMap[T][1];

export type ExtractNotificationParams<T extends LSPNotificationMethod> =
    LSPNotificationMap[T];

// === Result Type Aliases ===
export type LSPResult<T> = Result<T, LSPError[]>;
export type LSPAsyncResult<T> = AsyncResult<T, LSPError[]>;

// === Advanced Types ===
export interface TypedConnection {
    sendTypedRequest<K extends LSPMethod>(
        method: K,
        params: ExtractParams<K>,
        token?: CancellationToken,
    ): Promise<ExtractResult<K>>;

    onTypedNotification<K extends LSPNotificationMethod>(
        method: K,
        handler: NotificationHandler<ExtractNotificationParams<K>>,
    ): Subscription;
}
