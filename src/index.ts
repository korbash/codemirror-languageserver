// Main exports for backward compatibility
export { languageServer, languageServerWithTransport } from './plugin/factory';
export { LanguageServerClient } from './client/LanguageServerClient';

// Export types for TypeScript users
export type {
    LSPRequestMap,
    LSPNotifyMap,
    LSPEventMap,
    Notification,
    LanguageServerBaseOptions,
    LanguageServerClientOptions,
    LanguageServerOptions,
    LanguageServerWebsocketOptions,
    PyrightInitializationOptions,
    RustAnalyzerInitializationOptions,
    TypeScriptInitializationOptions,
    ESLintInitializationOptions,
    ClangdInitializationOptions,
    GoplsInitializationOptions,
} from './types/lsp';

export type {
    Transport,
    TransportOptions,
    WebSocketTransportOptions,
    FetchTransportOptions,
} from './types/transport';

// Export plugin components for advanced usage
export { LanguageServerPlugin } from './plugin/LanguageServerPlugin';
export type { LanguageServerPluginOptions } from './plugin/LanguageServerPlugin';
export { client, documentUri, languageId } from './plugin/facets';

// Export feature providers for extensibility
export type {
    HoverProvider,
    CompletionProvider,
    DiagnosticsProvider,
} from './features';
export {
    DefaultHoverProvider,
    DefaultCompletionProvider,
    DefaultDiagnosticsProvider,
    createDiagnosticsProvider,
} from './features';

// Export transports
export { WebSocketTransport } from '@open-rpc/client-js';

// Export utility functions
export {
    posToOffset,
    offsetToPos,
    formatContents,
    toSet,
    prefixMatch,
    isLSPTextEdit,
    isLSPMarkupContent,
} from './utils';