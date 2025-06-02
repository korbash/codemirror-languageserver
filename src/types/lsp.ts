import { Transport } from '@open-rpc/client-js/build/transports/Transport';
import * as LSP from 'vscode-languageserver-protocol';

export interface LSPRequestMap {
    initialize: [LSP.InitializeParams, LSP.InitializeResult];
    'textDocument/hover': [LSP.HoverParams, LSP.Hover];
    'textDocument/completion': [
        LSP.CompletionParams,
        LSP.CompletionItem[] | LSP.CompletionList | null,
    ];
}

export interface LSPNotifyMap {
    initialized: LSP.InitializedParams;
    'textDocument/didChange': LSP.DidChangeTextDocumentParams;
    'textDocument/didOpen': LSP.DidOpenTextDocumentParams;
}

export interface LSPEventMap {
    'textDocument/publishDiagnostics': LSP.PublishDiagnosticsParams;
}

export type Notification = {
    [key in keyof LSPEventMap]: {
        jsonrpc: '2.0';
        id?: null | undefined;
        method: key;
        params: LSPEventMap[key];
    };
}[keyof LSPEventMap];

export interface LanguageServerBaseOptions {
    rootUri: string | null;
    workspaceFolders: LSP.WorkspaceFolder[] | null;
    documentUri: string;
    languageId: string;
}

export interface LanguageServerClientOptions<TInitOptions = unknown>
    extends LanguageServerBaseOptions {
    transport: Transport;
    autoClose?: boolean;
    initializationOptions?: TInitOptions;
}

export interface LanguageServerOptions<TInitOptions = unknown>
    extends LanguageServerClientOptions<TInitOptions> {
    client?: any; // LanguageServerClient<TInitOptions>
    allowHTMLContent?: boolean;
}

export interface LanguageServerWebsocketOptions<TInitOptions = unknown>
    extends LanguageServerBaseOptions {
    serverUri: `ws://${string}` | `wss://${string}`;
    initializationOptions?: TInitOptions;
}

export interface PyrightInitializationOptions {
    python?: {
        pythonPath?: string;
        venvPath?: string;
        analysis?: {
            autoSearchPaths?: boolean;
            extraPaths?: string[];
            diagnosticMode?: 'workspace' | 'openFilesOnly';
            stubPath?: string;
            typeshedPaths?: string[];
            useLibraryCodeForTypes?: boolean;
            typeCheckingMode?: 'off' | 'basic' | 'strict';
            autoImportCompletions?: boolean;
            indexing?: boolean;
        };
    };
    reportMissingImports?: boolean;
    reportMissingTypeStubs?: boolean;
    reportMissingModuleSource?: boolean;
    reportInvalidTypeVarUse?: boolean;
    reportOptionalSubscript?: boolean;
    reportOptionalMemberAccess?: boolean;
    reportOptionalCall?: boolean;
    reportOptionalIterable?: boolean;
    reportOptionalContextManager?: boolean;
    reportOptionalOperand?: boolean;
    reportTypedDictNotRequiredAccess?: boolean;
    reportPrivateImportUsage?: boolean;
    reportConstantRedefinition?: boolean;
    reportIncompatibleMethodOverride?: boolean;
    reportIncompatibleVariableOverride?: boolean;
    reportInconsistentConstructor?: boolean;
}

export interface RustAnalyzerInitializationOptions {
    cargo?: {
        buildScripts?: {
            enable?: boolean;
            invocationStrategy?: 'per_workspace' | 'once';
            invocationLocation?: 'workspace' | 'root';
        };
        allTargets?: boolean;
        noDefaultFeatures?: boolean;
        allFeatures?: boolean;
        features?: string[];
        target?: string;
        runBuildScripts?: boolean;
        useRustcWrapperForBuildScripts?: boolean;
    };
    procMacro?: {
        enable?: boolean;
        ignored?: Record<string, string[]>;
        server?: string;
        attributes?: {
            enable?: boolean;
        };
    };
    diagnostics?: {
        enable?: boolean;
        disabled?: string[];
        warningsAsHint?: string[];
        warningsAsInfo?: string[];
        remapPrefix?: Record<string, string>;
        experimental?: {
            enable?: boolean;
        };
    };
    completion?: {
        addCallArgumentSnippets?: boolean;
        addCallParenthesis?: boolean;
        postfix?: {
            enable?: boolean;
        };
        autoimport?: {
            enable?: boolean;
        };
        privateEditable?: {
            enable?: boolean;
        };
    };
    assist?: {
        importGranularity?: 'preserve' | 'crate' | 'module' | 'item';
        importEnforceGranularity?: boolean;
        importPrefix?: 'plain' | 'by_self' | 'by_crate';
        allowMergingIntoGlobImports?: boolean;
    };
    callInfo?: {
        full?: boolean;
    };
    lens?: {
        enable?: boolean;
        run?: boolean;
        debug?: boolean;
        implementations?: boolean;
        refs?: boolean;
        methodReferences?: boolean;
        references?: boolean;
        enumVariantReferences?: boolean;
    };
    hover?: {
        documentation?: boolean;
        keywords?: boolean;
        linksInHover?: boolean;
        memoryLayout?: {
            enable?: boolean;
        };
    };
    workspace?: {
        symbol?: {
            search?: {
                scope?: 'workspace' | 'workspace_and_dependencies';
                kind?: 'only_types' | 'all_symbols';
            };
        };
    };
}

export interface TypeScriptInitializationOptions {
    hostInfo?: string;
    npmLocation?: string;
    globalPlugins?: string[];
    pluginProbeLocations?: string[];
    preferences?: {
        includePackageJsonAutoImports?: 'auto' | 'on' | 'off';
        providePrefixAndSuffixTextForRename?: boolean;
        allowRenameOfImportPath?: boolean;
        includeAutomaticOptionalChainCompletions?: boolean;
        includeCompletionsForModuleExports?: boolean;
        includeCompletionsForImportStatements?: boolean;
        includeCompletionsWithSnippetText?: boolean;
        includeCompletionsWithInsertText?: boolean;
        allowIncompleteCompletions?: boolean;
        importModuleSpecifier?: 'shortest' | 'relative' | 'absolute' | 'auto';
        importModuleSpecifierEnding?: 'minimal' | 'index' | 'js';
        allowTextChangesInNewFiles?: boolean;
        lazyConfiguredProjectsFromExternalProject?: boolean;
        providePrefixAndSuffixTextForQuickInfo?: boolean;
        includeInlayParameterNameHints?: 'none' | 'literals' | 'all';
        includeInlayParameterNameHintsWhenArgumentMatchesName?: boolean;
        includeInlayFunctionParameterTypeHints?: boolean;
        includeInlayVariableTypeHints?: boolean;
        includeInlayVariableTypeHintsWhenTypeMatchesName?: boolean;
        includeInlayPropertyDeclarationTypeHints?: boolean;
        includeInlayFunctionLikeReturnTypeHints?: boolean;
        includeInlayEnumMemberValueHints?: boolean;
    };
    locale?: string;
    maxTsServerMemory?: number;
    tsserver?: {
        logLevel?: 'off' | 'terse' | 'normal' | 'requestTime' | 'verbose';
        logVerbosity?: 'off' | 'terse' | 'normal' | 'requestTime' | 'verbose';
        trace?: 'off' | 'messages' | 'verbose';
        useSeparateSyntaxServer?: boolean;
        enableTracing?: boolean;
        path?: string;
    };
}

export interface ESLintInitializationOptions {
    packageManager?: 'npm' | 'yarn' | 'pnpm';
    nodePath?: string;
    options?: Record<string, any>;
    rules?: Record<string, any>;
    rulesCustomizations?: Array<{
        rule: string;
        severity: 'downgrade' | 'upgrade' | 'info' | 'warn' | 'error' | 'off';
    }>;
    run?: 'onType' | 'onSave';
    problems?: {
        shortenToSingleLine?: boolean;
    };
    codeAction?: {
        disableRuleComment?: {
            enable?: boolean;
            location?: 'separateLine' | 'sameLine';
        };
        showDocumentation?: {
            enable?: boolean;
        };
    };
    codeActionOnSave?: {
        enable?: boolean;
        mode?: 'all' | 'problems';
    };
    format?: {
        enable?: boolean;
    };
    quiet?: boolean;
    onIgnoredFiles?: 'off' | 'warn';
    useESLintClass?: boolean;
    experimental?: {
        useFlatConfig?: boolean;
    };
    workingDirectory?: {
        mode?: 'auto' | 'location';
    };
}

export interface ClangdInitializationOptions {
    compilationDatabasePath?: string;
    compilationDatabaseChanges?: Record<string, any>;
    fallbackFlags?: string[];
    clangdFileStatus?: boolean;
    utf8?: boolean;
    offsetEncoding?: ('utf-8' | 'utf-16' | 'utf-32')[];
    index?: {
        background?: 'Build' | 'Skip';
        threads?: number;
    };
    completion?: {
        detailedLabel?: boolean;
        allScopes?: boolean;
    };
    hover?: {
        showAKA?: boolean;
    };
    inlayHints?: {
        enabled?: boolean;
        parameterNames?: boolean;
        deducedTypes?: boolean;
        designators?: boolean;
    };
    semanticHighlighting?: boolean;
    diagnostics?: {
        unusedIncludes?: 'None' | 'Strict';
        missingIncludes?: 'None' | 'Strict';
        clangTidy?: boolean;
        suppressAll?: boolean;
    };
}

export interface GoplsInitializationOptions {
    buildFlags?: string[];
    env?: Record<string, string>;
    directoryFilters?: string[];
    templateExtensions?: string[];
    memoryMode?: 'DegradeClosed' | 'Normal';
    gofumpt?: boolean;
    staticcheck?: boolean;
    analyses?: Record<string, boolean>;
    codelenses?: Record<string, boolean>;
    usePlaceholders?: boolean;
    completionBudget?: string;
    diagnosticsDelay?: string;
    experimentalPostfixCompletions?: boolean;
    experimentalWorkspaceModule?: boolean;
    experimentalTemplateSupport?: boolean;
    semanticTokens?: boolean;
    noSemanticString?: boolean;
    noSemanticNumber?: boolean;
    expandWorkspaceToModule?: boolean;
    experimentalUseInvalidMetadata?: boolean;
    hoverKind?:
        | 'FullDocumentation'
        | 'NoDocumentation'
        | 'SingleLine'
        | 'Structured'
        | 'SynopsisDocumentation';
    linkTarget?: string;
    linksInHover?: boolean;
    importShortcut?: 'Both' | 'Definition' | 'Link';
    symbolMatcher?: 'CaseInsensitive' | 'CaseSensitive' | 'FastFuzzy' | 'Fuzzy';
    symbolStyle?: 'Dynamic' | 'Full' | 'Package';
    verboseOutput?: boolean;
}
