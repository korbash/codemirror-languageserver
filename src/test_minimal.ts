/**
 * Minimal LSP test - just connect, initialize, and get response
 */

import { WebSocketTransport } from './transports/WebSocketTransport.js';
import * as LSP from 'vscode-languageserver-protocol';

async function minimalTest() {
    console.log('🧪 Minimal LSP Test: ws://127.0.0.1:8000/lsp/python');

    const transport = new WebSocketTransport('ws://127.0.0.1:8000/lsp/python');

    try {
        // Connect
        console.log('⏳ Connecting...');
        await transport.connect();
        console.log('✅ Connected');

        // Get connection
        const connection = transport.connection;

        // Send initialize
        console.log('⏳ Initializing LSP...');
        const result = await connection.sendRequest(
            LSP.InitializeRequest.type,
            {
                processId: null,
                rootUri: 'file:///test',
                capabilities: {},
            },
        );

        console.log('✅ LSP Initialize successful!');
        console.log(
            '📋 Server capabilities keys:',
            Object.keys(result.capabilities),
        );

        if (result.serverInfo) {
            console.log(
                '🔧 Server:',
                result.serverInfo.name,
                result.serverInfo.version,
            );
        }

        // Send initialized
        await connection.sendNotification(LSP.InitializedNotification.type, {});
        console.log('✅ LSP ready!');
    } catch (error) {
        console.error(
            '❌ Error:',
            error instanceof Error ? error.message : error,
        );
        if (error && typeof error === 'object' && 'code' in error) {
            console.error('Code:', (error as any).code);
        }
    } finally {
        transport.close();
        console.log('🔚 Closed');
    }
}

// Run immediately
minimalTest().catch(console.error);
