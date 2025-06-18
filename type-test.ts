/**
 * Type safety test for LSP methods enum
 *
 * This file demonstrates that our new LSPMethods enum provides
 * better type safety than the previous RequestType approach.
 */

import { LSPMethods, LSPNotifications, LSPMethodValue, LSPNotificationValue } from './src/types/index.js';

// ✅ Valid usage - these should compile without errors
const validRequestMethods: LSPMethodValue[] = [
    LSPMethods.TEXTDOCUMENT_COMPLETION,
    LSPMethods.TEXTDOCUMENT_HOVER,
    LSPMethods.TEXTDOCUMENT_DEFINITION,
    LSPMethods.INITIALIZE,
    LSPMethods.TEXTDOCUMENT_REFERENCES,
];

const validNotificationMethods: LSPNotificationValue[] = [
    LSPNotifications.TEXTDOCUMENT_DIDOPEN,
    LSPNotifications.TEXTDOCUMENT_DIDCHANGE,
    LSPNotifications.TEXTDOCUMENT_DIDCLOSE,
];

// ✅ Function that accepts only valid LSP methods
function mockSendRequest(method: LSPMethodValue, params: any): void {
    console.log(`Sending request: ${method}`);
}

function mockSendNotification(method: LSPNotificationValue, params: any): void {
    console.log(`Sending notification: ${method}`);
}

// ✅ Usage examples that should work
mockSendRequest(LSPMethods.TEXTDOCUMENT_COMPLETION, {
    textDocument: { uri: 'file://test.py' },
    position: { line: 0, character: 0 }
});

mockSendRequest(LSPMethods.TEXTDOCUMENT_HOVER, {
    textDocument: { uri: 'file://test.py' },
    position: { line: 0, character: 0 }
});

mockSendNotification(LSPNotifications.TEXTDOCUMENT_DIDOPEN, {
    textDocument: {
        uri: 'file://test.py',
        languageId: 'python',
        version: 1,
        text: 'print("hello")'
    }
});

// ✅ String literals should also work (for custom methods)
function mockSendCustomRequest(method: string, params: any): void {
    console.log(`Sending custom request: ${method}`);
}

mockSendCustomRequest('custom/myMethod', { data: 'test' });

// ✅ Enum provides IntelliSense and prevents typos
// Try typing "LSPMethods." in your IDE - you should see all available methods!

// ✅ Type unions work correctly
type SomeRequestMethods =
    | typeof LSPMethods.TEXTDOCUMENT_COMPLETION
    | typeof LSPMethods.TEXTDOCUMENT_HOVER
    | typeof LSPMethods.TEXTDOCUMENT_DEFINITION;

const specificMethods: SomeRequestMethods[] = [
    LSPMethods.TEXTDOCUMENT_COMPLETION,
    LSPMethods.TEXTDOCUMENT_HOVER,
    LSPMethods.TEXTDOCUMENT_DEFINITION,
    // LSPMethods.INITIALIZE, // ❌ This would cause a TypeScript error
];

// ✅ Demonstrate that our enum includes all LSP methods
console.log('Available Request Methods:');
Object.entries(LSPMethods).forEach(([key, value]) => {
    console.log(`  ${key} = '${value}'`);
});

console.log('\nAvailable Notification Methods:');
Object.entries(LSPNotifications).forEach(([key, value]) => {
    console.log(`  ${key} = '${value}'`);
});

// ✅ Count total methods
const totalRequests = Object.keys(LSPMethods).length;
const totalNotifications = Object.keys(LSPNotifications).length;
console.log(`\nTotal LSP methods: ${totalRequests + totalNotifications}`);
console.log(`  - Request methods: ${totalRequests}`);
console.log(`  - Notification methods: ${totalNotifications}`);

// ✅ Verify specific common methods exist
const commonMethods = [
    'textDocument/completion',
    'textDocument/hover',
    'textDocument/definition',
    'textDocument/references',
    'textDocument/documentSymbol',
    'initialize',
] as const;

commonMethods.forEach(method => {
    const found = Object.values(LSPMethods).includes(method as any);
    console.log(`${method}: ${found ? '✅' : '❌'}`);
});

export {
    validRequestMethods,
    validNotificationMethods,
    mockSendRequest,
    mockSendNotification,
};
