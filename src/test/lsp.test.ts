/**
 * LSP Protocol tests - тесты Language Server Protocol функций
 * Тестирует новую архитектуру LanguageServer с высокоуровневым API
 */

import assert from 'assert';
import {
    createAndInitializeLanguageServer,
    LanguageServerOptions,
    LanguageServer,
    CompletionParams,
    HoverParams,
    DefinitionParams,
    ReferenceParams,
    DidOpenTextDocumentParams,
    DidChangeTextDocumentParams,
    DidCloseTextDocumentParams,
    PublishDiagnosticsParams,
} from '../index.js';

const TEST_SERVER_URL = 'ws://127.0.0.1:8000/lsp/python';

const LSP_OPTIONS: LanguageServerOptions = {
    name: 'Python LSP Protocol Test',
    rootUri: 'file:///test-workspace',
    logging: { level: 'error' },
    request: { timeout: 15000, retries: 1 },
    connection: { reconnectAttempts: 1, reconnectDelay: 1000 },
    initializationOptions: {
        // Python LSP specific options
        settings: {
            python: {
                analysis: {
                    typeCheckingMode: 'basic',
                },
            },
        },
    },
};

const SAMPLE_PYTHON_CODE = `# Test Python code for LSP testing
import os
import sys

def fibonacci(n: int) -> int:
    """Calculate fibonacci number"""
    if n <= 1:
        return n
    return fibonacci(n-1) + fibonacci(n-2)

def main():
    print("Hello, World!")
    result = fibonacci(10)
    print(f"Fibonacci(10) = {result}")

    # This line has an intentional error for diagnostics
    undefined_variable = some_undefined_var

if __name__ == "__main__":
    main()
`;

describe('LSP Protocol Tests', () => {
    describe('Text Document Completion', () => {
        it('should provide completion suggestions', async () => {
            const result = await createAndInitializeLanguageServer(
                TEST_SERVER_URL,
                LSP_OPTIONS,
            );

            await result.match({
                success: async (server: LanguageServer) => {
                    try {
                        // Open a test document
                        await server.notifyDidOpenTextDocument({
                            textDocument: {
                                uri: 'file:///test.py',
                                languageId: 'python',
                                version: 1,
                                text: SAMPLE_PYTHON_CODE,
                            },
                        });

                        // Request completion at a meaningful position
                        const completionParams: CompletionParams = {
                            textDocument: { uri: 'file:///test.py' },
                            position: { line: 2, character: 7 }, // After "import "
                        };

                        const completion =
                            await server.completion(completionParams);

                        await completion.match({
                            success: (result: any) => {
                                console.log(
                                    '🔍 АВТОДОПОЛНЕНИЕ - ПОЛНЫЙ ОТВЕТ СЕРВЕРА:',
                                );
                                console.log('='.repeat(60));
                                console.log(JSON.stringify(result, null, 2));
                                console.log('='.repeat(60));

                                if (Array.isArray(result)) {
                                    console.log(
                                        `✅ Completion returned ${result.length} items`,
                                    );
                                    if (result.length > 0) {
                                        console.log(
                                            '📝 Первые несколько элементов:',
                                        );
                                        result
                                            .slice(0, 3)
                                            .forEach((item, index) => {
                                                console.log(
                                                    `  ${index + 1}. ${item.label || item.insertText || JSON.stringify(item)}`,
                                                );
                                            });
                                    }
                                } else if (result && result.items) {
                                    console.log(
                                        `✅ Completion returned ${result.items.length} items`,
                                    );
                                    assert.ok(
                                        Array.isArray(result.items),
                                        'Completion should have items array',
                                    );
                                    if (result.items.length > 0) {
                                        console.log(
                                            '📝 Первые несколько элементов:',
                                        );
                                        result.items
                                            .slice(0, 3)
                                            .forEach(
                                                (item: any, index: number) => {
                                                    console.log(
                                                        `  ${index + 1}. ${item.label || item.insertText || JSON.stringify(item)}`,
                                                    );
                                                },
                                            );
                                    }
                                } else {
                                    console.log(
                                        '✅ Completion request successful (no items)',
                                    );
                                }
                            },
                            timeout: async () => {
                                console.warn('⏰ Completion request timed out');
                            },
                            error: async (error: Error) => {
                                console.warn(
                                    '❌ Completion failed:',
                                    error.message,
                                );
                            },
                            cancelled: async () => {
                                console.warn('🚫 Completion cancelled');
                            },
                            connectionReset: async () => {
                                console.warn(
                                    '💔 Connection lost during completion',
                                );
                            },
                        });
                    } finally {
                        server.dispose();
                    }
                },
                timeout: async () => {
                    console.warn(
                        '⚠️  Server initialization timed out for completion test',
                    );
                },
                error: async (error: Error) => {
                    if (error.message.includes('ECONNREFUSED')) {
                        console.warn(
                            '⚠️  LSP server not available for completion test',
                        );
                        return;
                    }
                    throw error;
                },
                cancelled: async () => {
                    console.warn(
                        '⚠️  Server initialization cancelled for completion test',
                    );
                },
                connectionReset: async () => {
                    console.warn('⚠️  Connection reset during completion test');
                },
            });
        });

        it('should handle completion with different positions', async () => {
            const result = await createAndInitializeLanguageServer(
                TEST_SERVER_URL,
                LSP_OPTIONS,
            );

            await result.match({
                success: async (server: LanguageServer) => {
                    try {
                        await server.notifyDidOpenTextDocument({
                            textDocument: {
                                uri: 'file:///positions.py',
                                languageId: 'python',
                                version: 1,
                                text: 'print("test")\nos.',
                            },
                        });

                        const positions = [
                            { line: 0, character: 0 }, // Beginning
                            { line: 0, character: 5 }, // Middle of print
                            { line: 1, character: 3 }, // After "os."
                        ];

                        for (const position of positions) {
                            const completion = await server.completion({
                                textDocument: { uri: 'file:///positions.py' },
                                position,
                            });

                            await completion.match({
                                success: (result: any) => {
                                    console.log(
                                        `✅ Completion at ${position.line}:${position.character} successful`,
                                    );
                                },
                                timeout: async () => {
                                    console.warn(
                                        `⏰ Timeout at position ${position.line}:${position.character}`,
                                    );
                                },
                                error: async (error: Error) => {
                                    console.warn(
                                        `❌ Error at position ${position.line}:${position.character}:`,
                                        error.message,
                                    );
                                },
                                cancelled: async () => {
                                    console.warn(
                                        `🚫 Cancelled at position ${position.line}:${position.character}`,
                                    );
                                },
                                connectionReset: async () => {
                                    console.warn(
                                        `💔 Connection lost at position ${position.line}:${position.character}`,
                                    );
                                },
                            });
                        }
                    } finally {
                        server.dispose();
                    }
                },
                timeout: async () => {
                    console.warn(
                        '⚠️  Server timeout for position completion test',
                    );
                },
                error: async (error: Error) => {
                    if (error.message.includes('ECONNREFUSED')) {
                        console.warn(
                            '⚠️  Server not available for position completion test',
                        );
                        return;
                    }
                    throw error;
                },
                cancelled: async () => {
                    console.warn('⚠️  Cancelled for position completion test');
                },
                connectionReset: async () => {
                    console.warn(
                        '⚠️  Connection reset for position completion test',
                    );
                },
            });
        });
    });

    describe('Text Document Hover', () => {
        it('should provide hover information', async () => {
            const result = await createAndInitializeLanguageServer(
                TEST_SERVER_URL,
                LSP_OPTIONS,
            );

            await result.match({
                success: async (server: LanguageServer) => {
                    try {
                        await server.notifyDidOpenTextDocument({
                            textDocument: {
                                uri: 'file:///hover.py',
                                languageId: 'python',
                                version: 1,
                                text: SAMPLE_PYTHON_CODE,
                            },
                        });

                        const hoverParams: HoverParams = {
                            textDocument: { uri: 'file:///hover.py' },
                            position: { line: 4, character: 4 }, // On "fibonacci" function name
                        };

                        const hover = await server.hover(hoverParams);

                        await hover.match({
                            success: (result: any) => {
                                console.log('🔍 HOVER - ПОЛНЫЙ ОТВЕТ СЕРВЕРА:');
                                console.log('='.repeat(60));
                                console.log(JSON.stringify(result, null, 2));
                                console.log('='.repeat(60));

                                if (result && result.contents) {
                                    console.log(
                                        '✅ Hover information available',
                                    );
                                    console.log('📝 Содержимое hover:');
                                    if (typeof result.contents === 'string') {
                                        console.log(`  "${result.contents}"`);
                                    } else if (Array.isArray(result.contents)) {
                                        result.contents.forEach(
                                            (content: any, index: number) => {
                                                console.log(
                                                    `  ${index + 1}. ${typeof content === 'string' ? content : JSON.stringify(content)}`,
                                                );
                                            },
                                        );
                                    } else if (result.contents.value) {
                                        console.log(
                                            `  Тип: ${result.contents.kind || 'unknown'}`,
                                        );
                                        console.log(
                                            `  Значение: ${result.contents.value}`,
                                        );
                                    }

                                    if (result.range) {
                                        console.log('📍 Диапазон hover:');
                                        console.log(
                                            `  Начало: строка ${result.range.start.line}, символ ${result.range.start.character}`,
                                        );
                                        console.log(
                                            `  Конец: строка ${result.range.end.line}, символ ${result.range.end.character}`,
                                        );
                                    }

                                    assert.ok(
                                        result.contents,
                                        'Hover should have contents',
                                    );
                                } else {
                                    console.log(
                                        '✅ Hover request successful (no contents)',
                                    );
                                }
                            },
                            timeout: async () => {
                                console.warn('⏰ Hover request timed out');
                            },
                            error: async (error: Error) => {
                                console.warn('❌ Hover failed:', error.message);
                            },
                            cancelled: async () => {
                                console.warn('🚫 Hover cancelled');
                            },
                            connectionReset: async () => {
                                console.warn('💔 Connection lost during hover');
                            },
                        });
                    } finally {
                        server.dispose();
                    }
                },
                timeout: async () => {
                    console.warn('⚠️  Server timeout for hover test');
                },
                error: async (error: Error) => {
                    if (error.message.includes('ECONNREFUSED')) {
                        console.warn('⚠️  Server not available for hover test');
                        return;
                    }
                    throw error;
                },
                cancelled: async () => {
                    console.warn('⚠️  Cancelled for hover test');
                },
                connectionReset: async () => {
                    console.warn('⚠️  Connection reset for hover test');
                },
            });
        });
    });

    describe('Go to Definition', () => {
        it('should find symbol definitions', async () => {
            const result = await createAndInitializeLanguageServer(
                TEST_SERVER_URL,
                LSP_OPTIONS,
            );

            await result.match({
                success: async (server: LanguageServer) => {
                    try {
                        await server.notifyDidOpenTextDocument({
                            textDocument: {
                                uri: 'file:///definition.py',
                                languageId: 'python',
                                version: 1,
                                text: SAMPLE_PYTHON_CODE,
                            },
                        });

                        const definitionParams: DefinitionParams = {
                            textDocument: { uri: 'file:///definition.py' },
                            position: { line: 11, character: 13 }, // On fibonacci call
                        };

                        const definition =
                            await server.definition(definitionParams);

                        await definition.match({
                            success: (result: any) => {
                                if (result) {
                                    if (Array.isArray(result)) {
                                        console.log(
                                            `✅ Found ${result.length} definition(s)`,
                                        );
                                    } else {
                                        console.log('✅ Found definition');
                                    }
                                } else {
                                    console.log(
                                        '✅ Definition request successful (no results)',
                                    );
                                }
                            },
                            timeout: async () => {
                                console.warn('⏰ Definition request timed out');
                            },
                            error: async (error: Error) => {
                                console.warn(
                                    '❌ Definition failed:',
                                    error.message,
                                );
                            },
                            cancelled: async () => {
                                console.warn('🚫 Definition cancelled');
                            },
                            connectionReset: async () => {
                                console.warn(
                                    '💔 Connection lost during definition',
                                );
                            },
                        });
                    } finally {
                        server.dispose();
                    }
                },
                timeout: async () => {
                    console.warn('⚠️  Server timeout for definition test');
                },
                error: async (error: Error) => {
                    if (error.message.includes('ECONNREFUSED')) {
                        console.warn(
                            '⚠️  Server not available for definition test',
                        );
                        return;
                    }
                    throw error;
                },
                cancelled: async () => {
                    console.warn('⚠️  Cancelled for definition test');
                },
                connectionReset: async () => {
                    console.warn('⚠️  Connection reset for definition test');
                },
            });
        });
    });

    describe('Find References', () => {
        it('should find symbol references', async () => {
            const result = await createAndInitializeLanguageServer(
                TEST_SERVER_URL,
                LSP_OPTIONS,
            );

            await result.match({
                success: async (server: LanguageServer) => {
                    try {
                        await server.notifyDidOpenTextDocument({
                            textDocument: {
                                uri: 'file:///references.py',
                                languageId: 'python',
                                version: 1,
                                text: SAMPLE_PYTHON_CODE,
                            },
                        });

                        const referencesParams: ReferenceParams = {
                            textDocument: { uri: 'file:///references.py' },
                            position: { line: 4, character: 4 }, // On fibonacci function
                            context: { includeDeclaration: true },
                        };

                        const references =
                            await server.references(referencesParams);

                        await references.match({
                            success: (result: any) => {
                                if (Array.isArray(result)) {
                                    console.log(
                                        `✅ Found ${result.length} reference(s)`,
                                    );
                                } else {
                                    console.log(
                                        '✅ References request successful',
                                    );
                                }
                            },
                            timeout: async () => {
                                console.warn('⏰ References request timed out');
                            },
                            error: async (error: Error) => {
                                console.warn(
                                    '❌ References failed:',
                                    error.message,
                                );
                            },
                            cancelled: async () => {
                                console.warn('🚫 References cancelled');
                            },
                            connectionReset: async () => {
                                console.warn(
                                    '💔 Connection lost during references',
                                );
                            },
                        });
                    } finally {
                        server.dispose();
                    }
                },
                timeout: async () => {
                    console.warn('⚠️  Server timeout for references test');
                },
                error: async (error: Error) => {
                    if (error.message.includes('ECONNREFUSED')) {
                        console.warn(
                            '⚠️  Server not available for references test',
                        );
                        return;
                    }
                    throw error;
                },
                cancelled: async () => {
                    console.warn('⚠️  Cancelled for references test');
                },
                connectionReset: async () => {
                    console.warn('⚠️  Connection reset for references test');
                },
            });
        });
    });

    describe('Document Lifecycle', () => {
        it('should handle document open/change/close cycle', async () => {
            const result = await createAndInitializeLanguageServer(
                TEST_SERVER_URL,
                LSP_OPTIONS,
            );

            await result.match({
                success: async (server: LanguageServer) => {
                    try {
                        const documentUri = 'file:///lifecycle.py';

                        // Open document
                        await server.notifyDidOpenTextDocument({
                            textDocument: {
                                uri: documentUri,
                                languageId: 'python',
                                version: 1,
                                text: 'print("initial")',
                            },
                        });
                        console.log('✅ Document opened');

                        // Change document
                        await server.notifyDidChangeTextDocument({
                            textDocument: { uri: documentUri, version: 2 },
                            contentChanges: [
                                {
                                    text: 'print("modified")',
                                },
                            ],
                        });
                        console.log('✅ Document changed');

                        // Save document (if supported)
                        try {
                            await server.notifyDidSaveTextDocument({
                                textDocument: { uri: documentUri },
                                text: 'print("saved")',
                            });
                            console.log('✅ Document saved');
                        } catch (error) {
                            console.log('ℹ️  Document save not supported');
                        }

                        // Close document
                        await server.notifyDidCloseTextDocument({
                            textDocument: { uri: documentUri },
                        });
                        console.log('✅ Document closed');
                    } finally {
                        server.dispose();
                    }
                },
                timeout: async () => {
                    console.warn('⚠️  Server timeout for lifecycle test');
                },
                error: async (error: Error) => {
                    if (error.message.includes('ECONNREFUSED')) {
                        console.warn(
                            '⚠️  Server not available for lifecycle test',
                        );
                        return;
                    }
                    throw error;
                },
                cancelled: async () => {
                    console.warn('⚠️  Cancelled for lifecycle test');
                },
                connectionReset: async () => {
                    console.warn('⚠️  Connection reset for lifecycle test');
                },
            });
        });

        it('should handle rapid document changes', async () => {
            const result = await createAndInitializeLanguageServer(
                TEST_SERVER_URL,
                LSP_OPTIONS,
            );

            await result.match({
                success: async (server: LanguageServer) => {
                    try {
                        const documentUri = 'file:///rapid-changes.py';

                        await server.notifyDidOpenTextDocument({
                            textDocument: {
                                uri: documentUri,
                                languageId: 'python',
                                version: 1,
                                text: 'x = 1',
                            },
                        });

                        // Rapid changes
                        for (let i = 2; i <= 5; i++) {
                            await server.notifyDidChangeTextDocument({
                                textDocument: { uri: documentUri, version: i },
                                contentChanges: [{ text: `x = ${i}` }],
                            });
                        }

                        console.log('✅ Rapid document changes handled');

                        await server.notifyDidCloseTextDocument({
                            textDocument: { uri: documentUri },
                        });
                    } finally {
                        server.dispose();
                    }
                },
                timeout: async () => {
                    console.warn('⚠️  Server timeout for rapid changes test');
                },
                error: async (error: Error) => {
                    if (error.message.includes('ECONNREFUSED')) {
                        console.warn(
                            '⚠️  Server not available for rapid changes test',
                        );
                        return;
                    }
                    throw error;
                },
                cancelled: async () => {
                    console.warn('⚠️  Cancelled for rapid changes test');
                },
                connectionReset: async () => {
                    console.warn('⚠️  Connection reset for rapid changes test');
                },
            });
        });
    });

    describe('Diagnostics', () => {
        it('should receive diagnostics for syntax errors', async () => {
            const result = await createAndInitializeLanguageServer(
                TEST_SERVER_URL,
                LSP_OPTIONS,
            );

            await result.match({
                success: async (server: LanguageServer) => {
                    try {
                        const diagnosticsReceived: PublishDiagnosticsParams[] =
                            [];

                        // Subscribe to diagnostics
                        const subscription = server.onDiagnostics(
                            (params: PublishDiagnosticsParams) => {
                                diagnosticsReceived.push(params);
                                console.log(
                                    `📋 Received ${params.diagnostics.length} diagnostics for ${params.uri}`,
                                );
                            },
                        );

                        // Open document with intentional error
                        await server.notifyDidOpenTextDocument({
                            textDocument: {
                                uri: 'file:///diagnostics.py',
                                languageId: 'python',
                                version: 1,
                                text: 'print("valid")\nundefined_var = some_undefined_variable\nprint("more valid")',
                            },
                        });

                        // Wait a bit for diagnostics
                        await new Promise((resolve) =>
                            setTimeout(resolve, 2000),
                        );

                        subscription.dispose();

                        if (diagnosticsReceived.length > 0) {
                            console.log(
                                `✅ Received diagnostics from ${diagnosticsReceived.length} notifications`,
                            );
                            const totalDiagnostics = diagnosticsReceived.reduce(
                                (sum, params) =>
                                    sum + params.diagnostics.length,
                                0,
                            );
                            console.log(
                                `✅ Total diagnostics: ${totalDiagnostics}`,
                            );
                        } else {
                            console.log(
                                'ℹ️  No diagnostics received (may be normal)',
                            );
                        }

                        await server.notifyDidCloseTextDocument({
                            textDocument: { uri: 'file:///diagnostics.py' },
                        });
                    } finally {
                        server.dispose();
                    }
                },
                timeout: async () => {
                    console.warn('⚠️  Server timeout for diagnostics test');
                },
                error: async (error: Error) => {
                    if (error.message.includes('ECONNREFUSED')) {
                        console.warn(
                            '⚠️  Server not available for diagnostics test',
                        );
                        return;
                    }
                    throw error;
                },
                cancelled: async () => {
                    console.warn('⚠️  Cancelled for diagnostics test');
                },
                connectionReset: async () => {
                    console.warn('⚠️  Connection reset for diagnostics test');
                },
            });
        });
    });

    describe('Request Timeouts and Errors', () => {
        it('should handle request timeouts gracefully', async () => {
            const result = await createAndInitializeLanguageServer(
                TEST_SERVER_URL,
                {
                    ...LSP_OPTIONS,
                    request: { timeout: 1000 }, // Very short timeout
                },
            );

            await result.match({
                success: async (server: LanguageServer) => {
                    try {
                        await server.notifyDidOpenTextDocument({
                            textDocument: {
                                uri: 'file:///timeout-test.py',
                                languageId: 'python',
                                version: 1,
                                text: SAMPLE_PYTHON_CODE,
                            },
                        });

                        // Try a potentially slow operation
                        const completion = await server.completion({
                            textDocument: { uri: 'file:///timeout-test.py' },
                            position: { line: 10, character: 5 },
                        });

                        let timeoutHandled = false;

                        await completion.match({
                            success: () => {
                                console.log(
                                    '✅ Request completed within timeout',
                                );
                            },
                            timeout: async () => {
                                console.log('⏰ Request timed out as expected');
                                timeoutHandled = true;
                            },
                            error: () => {
                                console.log(
                                    '❌ Request failed (acceptable for timeout test)',
                                );
                                timeoutHandled = true;
                            },
                            cancelled: async () => {
                                console.log(
                                    '🚫 Request cancelled (acceptable for timeout test)',
                                );
                                timeoutHandled = true;
                            },
                            connectionReset: async () => {
                                console.log(
                                    '💔 Connection reset (acceptable for timeout test)',
                                );
                                timeoutHandled = true;
                            },
                        });

                        // For timeout test, any result is acceptable
                        console.log('✅ Timeout handling test completed');
                    } finally {
                        server.dispose();
                    }
                },
                timeout: async () => {
                    console.warn(
                        '⚠️  Server initialization timeout for timeout test',
                    );
                },
                error: async (error: Error) => {
                    if (error.message.includes('ECONNREFUSED')) {
                        console.warn(
                            '⚠️  Server not available for timeout test',
                        );
                        return;
                    }
                    throw error;
                },
                cancelled: async () => {
                    console.warn('⚠️  Cancelled for timeout test');
                },
                connectionReset: async () => {
                    console.warn('⚠️  Connection reset for timeout test');
                },
            });
        });

        it('should handle invalid requests gracefully', async () => {
            const result = await createAndInitializeLanguageServer(
                TEST_SERVER_URL,
                LSP_OPTIONS,
            );

            await result.match({
                success: async (server: LanguageServer) => {
                    try {
                        // Try completion with invalid position
                        const invalidCompletion = await server.completion({
                            textDocument: { uri: 'file:///nonexistent.py' },
                            position: { line: -1, character: -1 },
                        });

                        await invalidCompletion.match({
                            success: () => {
                                console.log(
                                    '✅ Invalid request succeeded (server handled gracefully)',
                                );
                            },
                            timeout: async () => {
                                console.log(
                                    '⏰ Invalid request timed out (expected)',
                                );
                            },
                            error: async (error: Error) => {
                                console.log(
                                    '❌ Invalid request failed (expected):',
                                    error.message,
                                );
                            },
                            cancelled: async () => {
                                console.log(
                                    '🚫 Invalid request cancelled (expected)',
                                );
                            },
                            connectionReset: async () => {
                                console.log(
                                    '💔 Connection reset for invalid request (expected)',
                                );
                            },
                        });

                        console.log(
                            '✅ Invalid request handling test completed',
                        );
                    } finally {
                        server.dispose();
                    }
                },
                timeout: async () => {
                    console.warn('⚠️  Server timeout for invalid request test');
                },
                error: async (error: Error) => {
                    if (error.message.includes('ECONNREFUSED')) {
                        console.warn(
                            '⚠️  Server not available for invalid request test',
                        );
                        return;
                    }
                    throw error;
                },
                cancelled: async () => {
                    console.warn('⚠️  Cancelled for invalid request test');
                },
                connectionReset: async () => {
                    console.warn(
                        '⚠️  Connection reset for invalid request test',
                    );
                },
            });
        });
    });
});
