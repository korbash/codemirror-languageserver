/**
 * Упрощенный типобезопасный LSP клиент
 * Обертка над vscode-languageserver с автоматическим выводом типов
 */

import {
    Connection,
    RequestType,
    CancellationToken,
    createConnection as createOriginalConnection,
    ConnectionOptions,
} from 'vscode-languageserver/node';

import {
    MessageReader,
    MessageWriter,
    ResponseError,
} from 'vscode-languageserver-protocol';

// Импортируем типы параметров из protocol
import {
    InitializeParams,
    InitializeResult,
    HoverParams,
    CompletionParams,
    DefinitionParams,
    ReferenceParams,
    DocumentSymbolParams,
    WorkspaceSymbolParams,
    CodeActionParams,
    DocumentFormattingParams,
    DocumentRangeFormattingParams,
    RenameParams,
    PrepareRenameParams,
    SignatureHelpParams,
    DocumentHighlightParams,
    CodeLensParams,
} from 'vscode-languageserver-protocol';

// Импортируем типы результатов из types
import {
    Hover,
    CompletionList,
    CompletionItem,
    Definition,
    DefinitionLink,
    Location,
    DocumentSymbol,
    SymbolInformation,
    WorkspaceSymbol,
    CodeAction,
    Command,
    TextEdit,
    WorkspaceEdit,
    Range,
    SignatureHelp,
    DocumentHighlight,
    CodeLens,
} from 'vscode-languageserver-types';

/**
 * Упрощенный тип запроса с автоматическим выводом типов
 */
export class SimpleRequestType<P, R, E = any> {
    // Phantom types для извлечения типов через TypeScript inference
    readonly __phantom_params!: P;
    readonly __phantom_result!: R;
    readonly __phantom_error!: E;

    constructor(public readonly method: string) {}

    /**
     * Внутренний RequestType для совместимости с vscode-languageserver
     */
    get _internal(): RequestType<P, R, E> {
        return new RequestType<P, R, E>(this.method);
    }
}

/**
 * Упрощенное соединение с автоматическим выводом типов
 */
export class SimpleConnection {
    constructor(private connection: Connection) {}

    /**
     * Отправка запроса с автоматическим выводом типов
     * TypeScript автоматически определит P, R, E из SimpleRequestType
     */
    async sendRequest<P, R, E>(
        type: SimpleRequestType<P, R, E>,
        params: P,
        token?: CancellationToken,
    ): Promise<R> {
        return this.connection.sendRequest(type._internal, params, token);
    }

    /**
     * Доступ к оригинальному соединению для сложных случаев
     */
    get original(): Connection {
        return this.connection;
    }

    /**
     * Запуск прослушивания соединения
     */
    listen(): void | Promise<void> {
        return this.connection.listen();
    }
}

// =============================================================================
// Определения основных LSP запросов
// =============================================================================

/**
 * Initialize - инициализация LSP сервера
 */
export const SimpleInitializeRequest = new SimpleRequestType<
    InitializeParams,
    InitializeResult,
    ResponseError
>('initialize');

/**
 * Hover - показ информации при наведении
 */
export const SimpleHoverRequest = new SimpleRequestType<
    HoverParams,
    Hover | null
>('textDocument/hover');

/**
 * Completion - автодополнение
 */
export const SimpleCompletionRequest = new SimpleRequestType<
    CompletionParams,
    CompletionList | CompletionItem[] | null
>('textDocument/completion');

/**
 * Definition - переход к определению
 */
export const SimpleDefinitionRequest = new SimpleRequestType<
    DefinitionParams,
    Definition | DefinitionLink[] | null
>('textDocument/definition');

/**
 * References - поиск ссылок
 */
export const SimpleReferencesRequest = new SimpleRequestType<
    ReferenceParams,
    Location[] | null
>('textDocument/references');

/**
 * Document Symbol - символы в документе
 */
export const SimpleDocumentSymbolRequest = new SimpleRequestType<
    DocumentSymbolParams,
    DocumentSymbol[] | SymbolInformation[] | null
>('textDocument/documentSymbol');

/**
 * Workspace Symbol - символы в workspace
 */
export const SimpleWorkspaceSymbolRequest = new SimpleRequestType<
    WorkspaceSymbolParams,
    WorkspaceSymbol[] | null
>('workspace/symbol');

/**
 * Code Action - действия с кодом
 */
export const SimpleCodeActionRequest = new SimpleRequestType<
    CodeActionParams,
    (CodeAction | Command)[] | null
>('textDocument/codeAction');

/**
 * Document Formatting - форматирование документа
 */
export const SimpleDocumentFormattingRequest = new SimpleRequestType<
    DocumentFormattingParams,
    TextEdit[] | null
>('textDocument/formatting');

/**
 * Document Range Formatting - форматирование диапазона
 */
export const SimpleDocumentRangeFormattingRequest = new SimpleRequestType<
    DocumentRangeFormattingParams,
    TextEdit[] | null
>('textDocument/rangeFormatting');

/**
 * Rename - переименование символа
 */
export const SimpleRenameRequest = new SimpleRequestType<
    RenameParams,
    WorkspaceEdit | null
>('textDocument/rename');

/**
 * Prepare Rename - подготовка переименования
 */
export const SimplePrepareRenameRequest = new SimpleRequestType<
    PrepareRenameParams,
    | Range
    | { range: Range; placeholder: string }
    | { defaultBehavior: boolean }
    | null
>('textDocument/prepareRename');

/**
 * Signature Help - помощь с сигнатурой функции
 */
export const SimpleSignatureHelpRequest = new SimpleRequestType<
    SignatureHelpParams,
    SignatureHelp | null
>('textDocument/signatureHelp');

/**
 * Document Highlight - подсветка символов
 */
export const SimpleDocumentHighlightRequest = new SimpleRequestType<
    DocumentHighlightParams,
    DocumentHighlight[] | null
>('textDocument/documentHighlight');

/**
 * Code Lens - линзы кода
 */
export const SimpleCodeLensRequest = new SimpleRequestType<
    CodeLensParams,
    CodeLens[] | null
>('textDocument/codeLens');

// =============================================================================
// Запросы без параметров
// =============================================================================

/**
 * Shutdown - завершение работы сервера
 */
export const SimpleShutdownRequest = new SimpleRequestType<void, void>(
    'shutdown',
);

/**
 * Exit - выход из сервера
 */
export const SimpleExitRequest = new SimpleRequestType<void, void>('exit');

// =============================================================================
// Фабричные функции
// =============================================================================

/**
 * Создание упрощенного соединения из оригинального
 */
export function wrapConnection(connection: Connection): SimpleConnection {
    return new SimpleConnection(connection);
}

/**
 * Создание нового упрощенного соединения
 */
export function createSimpleConnection(
    reader: MessageReader,
    writer: MessageWriter,
): SimpleConnection {
    const originalConnection = createOriginalConnection(reader, writer);
    return new SimpleConnection(originalConnection);
}

// =============================================================================
// Экспорт типов
// =============================================================================

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
    DefinitionLink,
    ReferenceParams,
    Location,
    DocumentSymbolParams,
    DocumentSymbol,
    SymbolInformation,
    WorkspaceSymbolParams,
    WorkspaceSymbol,
    CodeActionParams,
    CodeAction,
    Command,
    DocumentFormattingParams,
    TextEdit,
    DocumentRangeFormattingParams,
    RenameParams,
    WorkspaceEdit,
    PrepareRenameParams,
    Range,
    SignatureHelpParams,
    SignatureHelp,
    DocumentHighlightParams,
    DocumentHighlight,
    CodeLensParams,
    CodeLens,
    CancellationToken,
};
