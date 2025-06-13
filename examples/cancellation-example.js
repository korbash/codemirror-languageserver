// Простой пример отмены операций в codemirror-languageserver

import { EditorState, EditorView } from '@codemirror/basic-setup';
import { python } from '@codemirror/lang-python';
import {
    languageServer,
    getLanguageServerClient,
    createAbortControllerWithTimeout,
} from '../src/index.js';

async function createEditor() {
    try {
        // Создаем LSP расширение с отменой через 5 минут
        const sessionController = createAbortControllerWithTimeout(300000);
        const lspExtension = await languageServer({
            serverUri: 'ws://localhost:3000',
            rootUri: 'file:///',
            documentUri: 'file:///example.py',
            languageId: 'python',
            abortSignal: sessionController.signal,
        });

        // Создаем редактор
        const view = new EditorView({
            state: EditorState.create({
                doc: `# Пример отмены операций
import numpy as np

def calculate(data):
    return np.mean(data)
`,
                extensions: [python(), ...lspExtension],
            }),
            parent: document.body,
        });

        const client = getLanguageServerClient(view);

        // Демонстрация отмены операций
        await demonstratecancellation(client);

        return view;
    } catch (error) {
        console.error('LSP error:', error);
        return null;
    }
}

async function demonstratecancellation(client) {
    console.log('🔄 Demo: Hover with 2 second timeout');

    try {
        const hoverController = createAbortControllerWithTimeout(2000);
        const result = await client.textDocumentHover(
            {
                textDocument: { uri: 'file:///example.py' },
                position: { line: 3, character: 4 },
            },
            hoverController.signal,
        );
        console.log('✅ Hover result:', result ? 'success' : 'no result');
    } catch (error) {
        console.log('❌ Hover cancelled:', error.message);
    }

    console.log('🔄 Demo: Completion with manual cancellation');

    try {
        const completionController = new AbortController();

        // Cancel after 1 second
        setTimeout(() => {
            console.log('⏱️ Cancelling completion...');
            completionController.abort();
        }, 1000);

        const result = await client.textDocumentCompletion(
            {
                textDocument: { uri: 'file:///example.py' },
                position: { line: 2, character: 10 },
            },
            completionController.signal,
        );

        console.log('✅ Completion result:', result?.length || 0, 'items');
    } catch (error) {
        console.log('❌ Completion cancelled:', error.message);
    }
}

// Инициализация
document.addEventListener('DOMContentLoaded', async () => {
    const view = await createEditor();

    // Очистка при закрытии
    window.addEventListener('beforeunload', () => {
        view?.destroy();
    });
});
