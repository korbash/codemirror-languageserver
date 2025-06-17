/**
 * Example usage of the new CodeMirror LSP Client architecture.
 *
 * This file demonstrates how to use the Zed-style LSP client with Microsoft
 * LSP types for type-safe, high-performance language server integration.
 */

import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
// Optional CodeMirror extensions - install these packages if you want to use them:
// npm install @codemirror/lang-javascript @codemirror/theme-one-dark
// import { javascript } from '@codemirror/lang-javascript';
// import { oneDark } from '@codemirror/theme-one-dark';

import {
    LanguageServer,
    createAndInitializeLanguageServer,
    LSPResult,
    ServerState,
    Subscription,
    InitializeParams,
    CompletionParams,
    HoverParams,
    DidOpenTextDocumentParams,
    DidChangeTextDocumentParams,
    PublishDiagnosticsParams,
    Diagnostic,
    CompletionItem,
    CompletionList,
    Hover,
    enableDebugMode,
    getDebugInfo,
} from './index.js';

import { Location, LocationLink } from 'vscode-languageserver-protocol';

// Enable debug mode for development
enableDebugMode();

/**
 * Example 1: Basic LSP client setup with error handling
 */
async function basicLSPSetup(): Promise<LanguageServer | null> {
    console.log('Setting up LSP client...');

    const serverResult = await createAndInitializeLanguageServer(
        'ws://localhost:3000', // Your LSP server WebSocket URL
        {
            name: 'TypeScript LSP',
            rootUri: 'file:///workspace',
            workspaceFolders: ['file:///workspace'],
            initializationOptions: {
                // TypeScript-specific options
                preferences: {
                    providePrefixAndSuffixTextForRename: true,
                    allowRenameOfImportPath: true,
                    includePackageJsonAutoImports: 'auto',
                },
            },
            request: {
                timeout: 30000,
                retries: 2,
            },
            connection: {
                reconnectAttempts: 3,
                reconnectDelay: 1000,
            },
            logging: {
                level: 'info',
                prefix: 'TS-LSP',
            },
        },
        // Optional custom initialize params
        {
            capabilities: {
                textDocument: {
                    completion: {
                        completionItem: {
                            snippetSupport: true,
                            resolveSupport: {
                                properties: [
                                    'documentation',
                                    'detail',
                                    'additionalTextEdits',
                                ],
                            },
                        },
                    },
                    hover: {
                        contentFormat: ['markdown', 'plaintext'],
                    },
                },
            },
        },
    );

    // Use pattern matching for comprehensive error handling
    return serverResult.match({
        success: (server) => {
            console.log('✅ LSP server initialized successfully!');
            console.log('Server capabilities:', server.getCapabilities());
            return server;
        },
        timeout: () => {
            console.error('❌ LSP server initialization timed out');
            return null;
        },
        error: (error) => {
            console.error(
                '❌ LSP server initialization failed:',
                error.message,
            );
            return null;
        },
        cancelled: () => {
            console.log('⚠️ LSP server initialization was cancelled');
            return null;
        },
        connectionReset: () => {
            console.error('💔 Connection lost during initialization');
            return null;
        },
    });
}

/**
 * Example 2: Setting up LSP notifications with automatic cleanup
 */
function setupLSPNotifications(server: LanguageServer): Array<Subscription> {
    const subscriptions: Subscription[] = [];

    // Subscribe to diagnostics with automatic type inference
    const diagnosticsSubscription = server.onDiagnostics(
        (params: PublishDiagnosticsParams) => {
            console.log(`📋 Diagnostics for ${params.uri}:`);
            params.diagnostics.forEach((diagnostic: Diagnostic) => {
                const severity = [
                    '',
                    'Error',
                    'Warning',
                    'Information',
                    'Hint',
                ][diagnostic.severity || 1];
                console.log(
                    `  ${severity}: ${diagnostic.message} (line ${diagnostic.range.start.line})`,
                );
            });
        },
    );
    subscriptions.push(diagnosticsSubscription);

    // Subscribe to server messages
    const showMessageSubscription = server.onShowMessage((params: any) => {
        const types = ['', 'Error', 'Warning', 'Info', 'Log'];
        console.log(
            `💬 Server message [${types[params.type]}]: ${params.message}`,
        );
    });
    subscriptions.push(showMessageSubscription);

    // Subscribe to progress notifications
    const progressSubscription = server.onProgress((params: any) => {
        if (params.value.kind === 'begin') {
            console.log(`⏳ Starting: ${params.value.title}`);
        } else if (params.value.kind === 'end') {
            console.log(
                `✅ Completed: ${params.value.message || 'Task finished'}`,
            );
        }
    });
    subscriptions.push(progressSubscription);

    // Monitor server state changes
    const stateSubscription = server.onStateChange((state: ServerState) => {
        console.log(`🔄 Server state changed to: ${state}`);

        if (state === ServerState.Error) {
            console.error('💥 Server entered error state!');
        }
    });
    subscriptions.push(stateSubscription);

    return subscriptions;
}

/**
 * Example 3: Making LSP requests with comprehensive error handling
 */
async function makeLSPRequests(server: LanguageServer, documentUri: string) {
    console.log('Making LSP requests...');

    // 1. Send completion request
    const completionResult = await server.completion(
        {
            textDocument: { uri: documentUri },
            position: { line: 10, character: 5 },
            context: {
                triggerKind: 2, // TriggerCharacter
                triggerCharacter: '.',
            },
        },
        {
            timeout: 5000, // Custom timeout for this request
        },
    );

    await completionResult.match({
        success: async (
            completion: CompletionList | CompletionItem[] | null,
        ) => {
            if (!completion) {
                console.log('No completion items available');
                return;
            }

            const items = Array.isArray(completion)
                ? completion
                : completion.items;
            console.log(`📝 Found ${items.length} completion items:`);

            items.slice(0, 5).forEach((item: CompletionItem) => {
                console.log(
                    `  - ${item.label} (${item.kind ? `kind: ${item.kind}` : 'no kind'})`,
                );
            });
        },
        timeout: async () => {
            console.warn('⏰ Completion request timed out');
        },
        error: async (error: any) => {
            console.error('❌ Completion request failed:', error.message);
        },
        cancelled: async () => {
            console.log('🚫 Completion request was cancelled');
        },
        connectionReset: async () => {
            console.error('💔 Connection lost during completion request');
        },
    });

    // 2. Send hover request
    const hoverResult = await server.hover({
        textDocument: { uri: documentUri },
        position: { line: 5, character: 10 },
    });

    await hoverResult.match({
        success: async (hover: Hover | null) => {
            if (hover && hover.contents) {
                console.log('💡 Hover information available');
                if (typeof hover.contents === 'string') {
                    console.log(`  Content: ${hover.contents}`);
                } else if (Array.isArray(hover.contents)) {
                    hover.contents.forEach((content, i) => {
                        console.log(
                            `  Content ${i + 1}: ${typeof content === 'string' ? content : content.value}`,
                        );
                    });
                } else {
                    console.log(`  Content: ${hover.contents.value}`);
                }
            } else {
                console.log('No hover information available');
            }
        },
        error: async (error: any) => {
            console.error('❌ Hover request failed:', error.message);
        },
        timeout: async () => {
            console.warn('⏰ Hover request timed out');
        },
        cancelled: async () => {
            console.log('🚫 Hover request was cancelled');
        },
        connectionReset: async () => {
            console.error('💔 Connection lost during hover request');
        },
    });

    // 3. Send definition request
    const definitionResult = await server.definition({
        textDocument: { uri: documentUri },
        position: { line: 15, character: 8 },
    });

    await definitionResult.match({
        success: async (definition: any) => {
            if (definition) {
                if (Array.isArray(definition)) {
                    console.log(`🎯 Found ${definition.length} definition(s)`);
                    definition.forEach((loc, i) => {
                        // Type guard to distinguish Location from LocationLink
                        if ('targetUri' in loc && 'targetRange' in loc) {
                            // LocationLink
                            const link = loc as unknown as LocationLink;
                            console.log(
                                `  ${i + 1}. ${link.targetUri} (line ${link.targetRange.start.line})`,
                            );
                        } else {
                            // Location
                            const location = loc as Location;
                            console.log(
                                `  ${i + 1}. ${location.uri} (line ${location.range.start.line})`,
                            );
                        }
                    });
                } else {
                    // Type guard to distinguish Location from LocationLink
                    if (
                        'targetUri' in definition &&
                        'targetRange' in definition
                    ) {
                        // LocationLink
                        const link = definition as unknown as LocationLink;
                        console.log(
                            `🎯 Found definition at ${link.targetUri} (line ${link.targetRange.start.line})`,
                        );
                    } else {
                        // Location
                        const location = definition as Location;
                        console.log(
                            `🎯 Found definition at ${location.uri} (line ${location.range.start.line})`,
                        );
                    }
                }
            } else {
                console.log('No definition found');
            }
        },
        error: async (error: any) => {
            console.error('❌ Definition request failed:', error.message);
        },
        timeout: async () => {
            console.warn('⏰ Definition request timed out');
        },
        cancelled: async () => {
            console.log('🚫 Definition request was cancelled');
        },
        connectionReset: async () => {
            console.error('💔 Connection lost during definition request');
        },
    });
}

/**
 * Example 4: Document lifecycle management
 */
async function manageDocumentLifecycle(
    server: LanguageServer,
    documentUri: string,
    content: string,
) {
    console.log('Managing document lifecycle...');

    // Open document
    await server.notifyDidOpenTextDocument({
        textDocument: {
            uri: documentUri,
            languageId: 'typescript',
            version: 1,
            text: content,
        },
    });
    console.log('📂 Document opened');

    // Simulate document changes
    await server.notifyDidChangeTextDocument({
        textDocument: {
            uri: documentUri,
            version: 2,
        },
        contentChanges: [
            {
                range: {
                    start: { line: 0, character: 0 },
                    end: { line: 0, character: 0 },
                },
                text: '// Updated content\n',
            },
        ],
    });
    console.log('✏️ Document updated');

    // Save document
    await server.notifyDidSaveTextDocument({
        textDocument: { uri: documentUri },
        text: content, // Optional: include text if server expects it
    });
    console.log('💾 Document saved');

    // Note: Document will be closed automatically when server is disposed
}

/**
 * Example 5: Integration with CodeMirror editor
 */
function createCodeMirrorWithLSP(
    server: LanguageServer,
    container: HTMLElement,
): EditorView {
    const documentUri = 'file:///workspace/example.ts';
    const initialContent = `
// TypeScript example
interface User {
    name: string;
    age: number;
}

function greetUser(user: User): string {
    return \`Hello, \${user.name}! You are \${user.age} years old.\`;
}

const user: User = {
    name: "Alice",
    age: 30
};

console.log(greetUser(user));
`.trim();

    // Create CodeMirror editor
    const view = new EditorView({
        state: EditorState.create({
            doc: initialContent,
            extensions: [
                // javascript({ typescript: true }), // Uncomment if you have @codemirror/lang-javascript installed
                // oneDark, // Uncomment if you have @codemirror/theme-one-dark installed
                EditorView.updateListener.of(async (update) => {
                    if (update.docChanged) {
                        // Send document changes to LSP server
                        await server.notifyDidChangeTextDocument({
                            textDocument: {
                                uri: documentUri,
                                version: update.state.doc.length, // Simple version tracking
                            },
                            contentChanges: [
                                {
                                    text: update.state.doc.toString(),
                                },
                            ],
                        });
                    }
                }),
            ],
        }),
        parent: container,
    });

    // Open document in LSP server
    server.notifyDidOpenTextDocument({
        textDocument: {
            uri: documentUri,
            languageId: 'typescript',
            version: 1,
            text: initialContent,
        },
    });

    return view;
}

/**
 * Example 6: Complete application setup with cleanup
 */
async function setupCompleteApplication() {
    console.log('🚀 Starting complete LSP application...');

    // Setup LSP server
    const server = await basicLSPSetup();
    if (!server) {
        console.error('Failed to setup LSP server');
        return;
    }

    // Setup notifications
    const subscriptions = setupLSPNotifications(server);

    const documentUri = 'file:///workspace/example.ts';
    const documentContent = 'const message: string = "Hello, LSP!";';

    try {
        // Manage document lifecycle
        await manageDocumentLifecycle(server, documentUri, documentContent);

        // Make some requests
        await makeLSPRequests(server, documentUri);

        // Show debug information
        console.log('🔍 Debug info:', getDebugInfo());

        // Simulate application running for a while
        console.log('⏳ Application running... (will cleanup in 30 seconds)');
        await new Promise((resolve) => setTimeout(resolve, 30000));
    } finally {
        // Cleanup resources (RAII-style)
        console.log('🧹 Cleaning up resources...');

        // Dispose all subscriptions
        subscriptions.forEach((sub) => sub.dispose());

        // Close document
        await server.notifyDidCloseTextDocument({
            textDocument: { uri: documentUri },
        });

        // Shutdown server
        const shutdownResult = await server.shutdown();
        shutdownResult.match({
            success: () => console.log('✅ Server shutdown successfully'),
            error: (error: any) =>
                console.error('❌ Server shutdown failed:', error.message),
            timeout: () => console.warn('⏰ Server shutdown timed out'),
            cancelled: () => console.log('🚫 Server shutdown was cancelled'),
            connectionReset: () =>
                console.log('💔 Connection lost during shutdown'),
        });

        // Dispose server (releases all resources)
        server.dispose();

        console.log('✨ Cleanup complete!');
    }
}

/**
 * Example 7: Using with modern JavaScript features
 */
async function modernJavaScriptExample() {
    // Using TC39 Symbol.dispose proposal for automatic cleanup
    try {
        using server = await createAndInitializeLanguageServer(
            'ws://localhost:3000',
            {
                name: 'Modern LSP Client',
                rootUri: 'file:///workspace',
                logging: { level: 'debug' },
            },
        ).then((result) =>
            result.match({
                success: (server) => server,
                error: () => {
                    throw new Error('Failed to initialize server');
                },
                timeout: () => {
                    throw new Error('Server initialization timed out');
                },
                cancelled: () => {
                    throw new Error('Server initialization cancelled');
                },
                connectionReset: () => {
                    throw new Error('Connection lost');
                },
            }),
        );

        // Server will be automatically disposed when exiting this block
        using diagnostics = server.onDiagnostics((params: any) => {
            console.log('Diagnostics received:', params.diagnostics.length);
        });

        // Make requests
        const completion = await server.completion({
            textDocument: { uri: 'file:///test.ts' },
            position: { line: 0, character: 0 },
        });

        completion.match({
            success: (items: any) => console.log('Completion successful'),
            error: (error: any) => console.error('Completion failed:', error),
            timeout: () => console.warn('Completion timed out'),
            cancelled: () => console.log('Completion cancelled'),
            connectionReset: () => console.error('Connection lost'),
        });

        // Both server and diagnostics subscription will be automatically disposed
        // when exiting this try block (RAII-style cleanup)
    } catch (error) {
        console.error('Modern example failed:', error);
    }
}

// Export examples for use in other modules
export {
    basicLSPSetup,
    setupLSPNotifications,
    makeLSPRequests,
    manageDocumentLifecycle,
    createCodeMirrorWithLSP,
    setupCompleteApplication,
    modernJavaScriptExample,
};

// Auto-run complete example if this file is executed directly
if (
    typeof window !== 'undefined' &&
    window.location?.search?.includes('run-example')
) {
    setupCompleteApplication().catch(console.error);
}
