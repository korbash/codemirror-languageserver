// Main exports for backward compatibility
// Export transports
export { WebSocketTransport } from '@open-rpc/client-js';
export { LanguageServerClient } from './client/LanguageServerClient';
export {
    createDiagnosticsProvider,
    DefaultCompletionProvider,
    DefaultDiagnosticsProvider,
    DefaultHoverProvider,
} from './features';
// Export feature providers for extensibility
export type {
    CompletionProvider,
    DiagnosticsProvider,
    HoverProvider,
} from './features';
export { client, documentUri, languageId } from './plugin/facets';
export { 
    languageServer, 
    languageServerWithTransport,
    getLanguageServerClient,
} from './plugin/factory';
// Export plugin components for advanced usage
export { LanguageServerPlugin } from './plugin/LanguageServerPlugin';
export type { LanguageServerPluginOptions } from './plugin/LanguageServerPlugin';
// Export types for TypeScript users
export type {
    ClangdInitializationOptions,
    ESLintInitializationOptions,
    GoplsInitializationOptions,
    LanguageServerBaseOptions,
    LanguageServerClientOptions,
    LanguageServerOptions,
    LanguageServerWebsocketOptions,
    LSPEventMap,
    LSPNotifyMap,
    LSPRequestMap,
    Notification,
    PyrightInitializationOptions,
    RustAnalyzerInitializationOptions,
    TypeScriptInitializationOptions,
} from './types/lsp';
export type {
    FetchTransportOptions,
    Transport,
    TransportOptions,
    WebSocketTransportOptions,
} from './types/transport';
// Export utility functions
export {
    formatContents,
    isLSPMarkupContent,
    isLSPTextEdit,
    offsetToPos,
    posToOffset,
    prefixMatch,
    toSet,
    // Logger utilities
    createLogger,
    setLogLevel,
    getLogLevel,
    enableAll,
    disableAll,
    logger,
    logMethodCall,
    logAsyncMethodCall,
} from './utils';
// Export logger types
export type { Logger, LogLevel, ModuleName } from './utils';
