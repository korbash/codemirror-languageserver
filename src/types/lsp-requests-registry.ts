/**
 * LSP запросы с использованием Mapped Types для автоматического сужения типов
 * Каждый метод определяется как [Params, Response] tuple для лучшего type inference
 */

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

// =============================================================================
// LSP Request Registry с Mapped Types
// =============================================================================

/**
 * Центральный реестр всех LSP методов с их параметрами и типами ответов
 * Формат: [ParamsType, ResponseType]
 */
export type LSPRequestRegistry = {
    // Lifecycle методы
    initialize: [InitializeParams, InitializeResult];
    shutdown: [void, void];
    exit: [void, void];

    // Text Document методы
    'textDocument/hover': [HoverParams, Hover | null];
    'textDocument/completion': [
        CompletionParams,
        CompletionList | CompletionItem[] | null,
    ];
    'textDocument/definition': [
        DefinitionParams,
        Definition | DefinitionLink[] | null,
    ];
    'textDocument/references': [ReferenceParams, Location[] | null];
    'textDocument/documentSymbol': [
        DocumentSymbolParams,
        DocumentSymbol[] | SymbolInformation[] | null,
    ];
    'textDocument/signatureHelp': [SignatureHelpParams, SignatureHelp | null];
    'textDocument/documentHighlight': [
        DocumentHighlightParams,
        DocumentHighlight[] | null,
    ];
    'textDocument/codeLens': [CodeLensParams, CodeLens[] | null];
    'textDocument/formatting': [DocumentFormattingParams, TextEdit[] | null];
    'textDocument/rangeFormatting': [
        DocumentRangeFormattingParams,
        TextEdit[] | null,
    ];
    'textDocument/codeAction': [
        CodeActionParams,
        (CodeAction | Command)[] | null,
    ];
    'textDocument/rename': [RenameParams, WorkspaceEdit | null];
    'textDocument/prepareRename': [
        PrepareRenameParams,
        (
            | Range
            | { range: Range; placeholder: string }
            | { defaultBehavior: boolean }
            | null
        ),
    ];

    // Workspace методы
    'workspace/symbol': [WorkspaceSymbolParams, WorkspaceSymbol[] | null];
};

// =============================================================================
// Утилитарные типы для автоматического сужения
// =============================================================================

/**
 * Извлекает все доступные LSP методы
 */
export type LSPMethod = keyof LSPRequestRegistry;

/**
 * Извлекает тип параметров для конкретного LSP метода
 * @example
 * type HoverParams = LSPParams<'textDocument/hover'>; // HoverParams
 * type RenameParams = LSPParams<'textDocument/rename'>; // RenameParams
 */
export type LSPParams<M extends LSPMethod> = LSPRequestRegistry[M][0];

/**
 * Извлекает тип ответа для конкретного LSP метода
 * @example
 * type HoverResponse = LSPResponse<'textDocument/hover'>; // Hover | null
 * type RenameResponse = LSPResponse<'textDocument/rename'>; // WorkspaceEdit | null
 */
export type LSPResponse<M extends LSPMethod> = LSPRequestRegistry[M][1];

// =============================================================================
// Функции-хелперы для создания типизированных запросов
// =============================================================================

/**
 * Проверяет, является ли строка валидным LSP методом
 * @param method - строка для проверки
 * @returns type predicate для сужения типа
 */
export function isValidLSPMethod(method: string): method is LSPMethod {
    return (
        method in
        ({
            initialize: true,
            shutdown: true,
            exit: true,
            'textDocument/hover': true,
            'textDocument/completion': true,
            'textDocument/definition': true,
            'textDocument/references': true,
            'textDocument/documentSymbol': true,
            'textDocument/signatureHelp': true,
            'textDocument/documentHighlight': true,
            'textDocument/codeLens': true,
            'textDocument/formatting': true,
            'textDocument/rangeFormatting': true,
            'textDocument/codeAction': true,
            'textDocument/rename': true,
            'textDocument/prepareRename': true,
            'workspace/symbol': true,
        } satisfies Record<LSPMethod, true>)
    );
}

// =============================================================================
// Константы для удобства использования
// =============================================================================

/**
 * Константы LSP методов для предотвращения опечаток и лучшего автодополнения
 */
export const LSP_METHODS = {
    // Lifecycle
    INITIALIZE: 'initialize',
    SHUTDOWN: 'shutdown',
    EXIT: 'exit',

    // Text Document
    HOVER: 'textDocument/hover',
    COMPLETION: 'textDocument/completion',
    DEFINITION: 'textDocument/definition',
    REFERENCES: 'textDocument/references',
    DOCUMENT_SYMBOL: 'textDocument/documentSymbol',
    SIGNATURE_HELP: 'textDocument/signatureHelp',
    DOCUMENT_HIGHLIGHT: 'textDocument/documentHighlight',
    CODE_LENS: 'textDocument/codeLens',
    FORMATTING: 'textDocument/formatting',
    RANGE_FORMATTING: 'textDocument/rangeFormatting',
    CODE_ACTION: 'textDocument/codeAction',
    RENAME: 'textDocument/rename',
    PREPARE_RENAME: 'textDocument/prepareRename',

    // Workspace
    WORKSPACE_SYMBOL: 'workspace/symbol',
} as const satisfies Record<string, LSPMethod>;

// =============================================================================
// Типы для категоризации методов
// =============================================================================

/**
 * Методы жизненного цикла LSP
 */
export type LSPLifecycleMethods = 'initialize' | 'shutdown' | 'exit';

/**
 * Методы для работы с текстовыми документами
 */
export type LSPTextDocumentMethods = Extract<
    LSPMethod,
    `textDocument/${string}`
>;

/**
 * Методы для работы с workspace
 */
export type LSPWorkspaceMethods = Extract<LSPMethod, `workspace/${string}`>;

/**
 * Проверяет, является ли метод методом жизненного цикла
 */
export function isLifecycleMethod(
    method: LSPMethod,
): method is LSPLifecycleMethods {
    return (
        method === 'initialize' || method === 'shutdown' || method === 'exit'
    );
}

/**
 * Проверяет, является ли метод методом для текстовых документов
 */
export function isTextDocumentMethod(
    method: LSPMethod,
): method is LSPTextDocumentMethods {
    return method.startsWith('textDocument/');
}

/**
 * Проверяет, является ли метод workspace методом
 */
export function isWorkspaceMethod(
    method: LSPMethod,
): method is LSPWorkspaceMethods {
    return method.startsWith('workspace/');
}
