// Main transport classes
export { WebSocketTransport } from './WebSocketTransport.js';
export type { WebSocketTransportOptions } from './WebSocketTransport.js';

// Message reader/writer for advanced usage
export {
    WebSocketMessageReader,
    WebSocketMessageWriter,
} from './WebSocketMessage.js';

// Transport interfaces and types
export type {
    Transport,
    LSPTransport,
    TransportOptions,
    FetchTransportOptions,
} from '../types/transport';

// Re-export commonly used LSP types and utilities
export type {
    InitializeParams,
    InitializeResult,
    HoverParams,
    Hover,
    CompletionParams,
    CompletionList,
    CompletionItem,
    DefinitionParams,
    Definition,
    PublishDiagnosticsParams,
    Diagnostic,
    DidOpenTextDocumentParams,
    DidChangeTextDocumentParams,
    DidSaveTextDocumentParams,
    DidCloseTextDocumentParams,
    ConfigurationParams,
    WorkspaceFolder,
    RegistrationParams,
    ShowMessageParams,
    LogMessageParams,
} from 'vscode-languageserver-protocol';

export {
    CancellationTokenSource,
    type CancellationToken,
    type Disposable,
} from 'vscode-jsonrpc';

// Re-export LSP protocol constants and utilities
export {
    InitializeRequest,
    HoverRequest,
    CompletionRequest,
    DefinitionRequest,
    ReferencesRequest,
    DocumentSymbolRequest,
    DocumentFormattingRequest,
    CodeActionRequest,
    WorkspaceSymbolRequest,
    ShutdownRequest,
    InitializedNotification,
    DidOpenTextDocumentNotification,
    DidChangeTextDocumentNotification,
    DidSaveTextDocumentNotification,
    DidCloseTextDocumentNotification,
    PublishDiagnosticsNotification,
    ShowMessageNotification,
    LogMessageNotification,
    ConfigurationRequest,
    WorkspaceFoldersRequest,
    RegistrationRequest,
    ExitNotification,
} from 'vscode-languageserver-protocol';
