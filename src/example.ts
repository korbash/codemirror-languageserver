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
    let server: LanguageServer | null = null;
    const result = await serverResult.promise;
    if (result.isOk()) {
        const s = result.unwrap();
        console.log('✅ LSP server initialized successfully!');
        console.log('Server capabilities:', s.getCapabilities());
        server = s;
    } else {
        const errors = result.unwrapErr();
        console.error(
            '❌ LSP server initialization failed:',
            errors.map((e) => e.message).join(', '),
        );
    }
    return server;
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
    ).promise;

    if (completionResult.isOk()) {
        const completion = completionResult.unwrap();
        if (!completion) {
            console.log('No completion items available');
        } else {
            const items = Array.isArray(completion)
                ? completion
                : completion.items;
            console.log(`📝 Found ${items.length} completion items:`);

            items.slice(0, 5).forEach((item: CompletionItem) => {
                console.log(
                    `  - ${item.label} (${item.kind ? `kind: ${item.kind}` : 'no kind'})`,
                );
            });
        }
    } else {
        const errors = completionResult.unwrapErr();
        console.error(
            '❌ Completion request failed:',
            errors.map((e) => e.message).join(', '),
        );
    }

    // 2. Send hover request
    const hoverResult = await server.hover({
        textDocument: { uri: documentUri },
        position: { line: 5, character: 10 },
    }).promise;

    if (hoverResult.isOk()) {
        const hover = hoverResult.unwrap();
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
    } else {
        const errors = hoverResult.unwrapErr();
        console.error(
            '❌ Hover request failed:',
            errors.map((e) => e.message).join(', '),
        );
    }

    // 3. Send definition request
    const definitionResult = await server.definition({
        textDocument: { uri: documentUri },
        position: { line: 15, character: 8 },
    }).promise;

    if (definitionResult.isOk()) {
        const definition = definitionResult.unwrap();
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
                if ('targetUri' in definition && 'targetRange' in definition) {
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
    } else {
        const errors = definitionResult.unwrapErr();
        console.error(
            '❌ Definition request failed:',
            errors.map((e) => e.message).join(', '),
        );
    }
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
        const shutdownResult = await server.shutdown().promise;
        if (shutdownResult.isOk()) {
            console.log('✅ Server shutdown successfully');
        } else {
            const errors = shutdownResult.unwrapErr();
            console.error(
                '❌ Server shutdown failed:',
                errors.map((e: any) => e.message).join(', '),
            );
        }

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
        const serverResult = await createAndInitializeLanguageServer(
            'ws://localhost:3000',
            {
                name: 'TypeScript LSP',
                rootUri: 'file:///workspace',
                logging: { level: 'debug' },
            },
        );

        let server: LanguageServer | null = null;
        const result = await serverResult.promise;
        if (result.isOk()) {
            server = result.unwrap();
        } else {
            const errors = result.unwrapErr();
            throw new Error(
                'Failed to initialize server: ' +
                    errors.map((e) => e.message).join(', '),
            );
        }

        if (!server) {
            throw new Error('Failed to get server instance');
        }

        // TypeScript type assertion to help with disposal
        const serverInstance: LanguageServer = server;
        using serverDisposable = serverInstance;

        // Server will be automatically disposed when exiting this block
        using diagnostics = serverInstance.onDiagnostics((params: any) => {
            console.log('Diagnostics received:', params.diagnostics.length);
        });

        // Make requests
        const completion = await server.completion({
            textDocument: { uri: 'file:///test.py' },
            position: { line: 0, character: 0 },
        }).promise;

        if (completion.isOk()) {
            console.log('Completion successful');
        } else {
            const errors = completion.unwrapErr();
            console.error(
                'Completion failed:',
                errors.map((e: any) => e.message).join(', '),
            );
        }

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
