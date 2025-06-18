/**
 * Error Handling Tests
 *
 * Tests for unified error handling using ErrorConverter utilities.
 * Demonstrates how ResponseError is converted to LSPError for consistent handling.
 */

import assert from 'assert';
import {
    ResponseError,
    LSPErrorCodes,
    ErrorCodes,
} from 'vscode-languageserver-protocol';
import {
    LSPError,
    convertResponseError,
    normalizeError,
    isLSPError,
    isResponseError,
    isCancellationError,
    shouldNotRetryError,
    getErrorMessage,
    getErrorCode,
    formatErrorForLogging,
} from '../types/ErrorConverter.js';
import { LSPResult } from '../types/LSPResult.js';

describe('Unified Error Handling', () => {
    describe('LSPError Class', () => {
        it('should create LSPError with all properties', () => {
            const error = new LSPError(
                'Test error message',
                ErrorCodes.MethodNotFound,
                { additional: 'data' },
                'textDocument/completion',
            );

            assert.strictEqual(error.name, 'LSPError');
            assert.strictEqual(error.message, 'Test error message');
            assert.strictEqual(error.code, -32601);
            assert.deepStrictEqual(error.data, { additional: 'data' });
            assert.strictEqual(error.method, 'textDocument/completion');
            assert.ok(error.timestamp > 0);
            assert.ok(error instanceof Error);
            assert.ok(error instanceof LSPError);
        });

        it('should correctly identify cancellation errors', () => {
            const requestCancelled = new LSPError(
                'Request cancelled',
                LSPErrorCodes.RequestCancelled,
            );
            const serverCancelled = new LSPError(
                'Server cancelled',
                LSPErrorCodes.ServerCancelled,
            );
            const otherError = new LSPError('Other error', -32603);

            assert.ok(requestCancelled.isCancellation());
            assert.ok(serverCancelled.isCancellation());
            assert.ok(!otherError.isCancellation());
        });

        it('should correctly identify content modification errors', () => {
            const contentModified = new LSPError(
                'Content modified',
                LSPErrorCodes.ContentModified,
            );
            const otherError = new LSPError('Other error', -32603);

            assert.ok(contentModified.isContentModified());
            assert.ok(!otherError.isContentModified());
        });

        it('should correctly determine retry logic', () => {
            const shouldNotRetryErrors = [
                new LSPError('Cancelled', LSPErrorCodes.RequestCancelled),
                new LSPError('Server cancelled', LSPErrorCodes.ServerCancelled),
                new LSPError('Method not found', ErrorCodes.MethodNotFound),
                new LSPError('Invalid params', ErrorCodes.InvalidParams),
            ];

            const canRetryErrors = [
                new LSPError('Internal error', ErrorCodes.InternalError),
                new LSPError('Parse error', ErrorCodes.ParseError),
                new LSPError('Content modified', LSPErrorCodes.ContentModified),
            ];

            shouldNotRetryErrors.forEach((error) => {
                assert.ok(
                    error.shouldNotRetry(),
                    `${error.getErrorType()} should not retry`,
                );
            });

            canRetryErrors.forEach((error) => {
                assert.ok(
                    !error.shouldNotRetry(),
                    `${error.getErrorType()} can retry`,
                );
            });
        });

        it('should provide human-readable error types', () => {
            const testCases = [
                [LSPErrorCodes.RequestCancelled, 'Request Cancelled'],
                [LSPErrorCodes.ServerCancelled, 'Server Cancelled'],
                [LSPErrorCodes.ContentModified, 'Content Modified'],
                [ErrorCodes.ParseError, 'Parse Error'],
                [ErrorCodes.InvalidRequest, 'Invalid Request'],
                [ErrorCodes.MethodNotFound, 'Method Not Found'],
                [ErrorCodes.InvalidParams, 'Invalid Parameters'],
                [ErrorCodes.InternalError, 'Internal Error'],
                [12345, 'LSP Error (12345)'],
            ];

            testCases.forEach(([code, expectedType]) => {
                const error = new LSPError('Test', code as number);
                assert.strictEqual(error.getErrorType(), expectedType);
            });
        });

        it('should provide enhanced toString output', () => {
            const error = new LSPError(
                'Test error message',
                ErrorCodes.MethodNotFound,
                { key: 'value' },
                'textDocument/hover',
            );

            const result = error.toString();
            assert.ok(result.includes('LSPError: Test error message'));
            assert.ok(result.includes('Code: -32601 (Method Not Found)'));
            assert.ok(result.includes('Method: textDocument/hover'));
            assert.ok(result.includes('Data: {"key":"value"}'));
        });
    });

    describe('ResponseError Conversion', () => {
        it('should convert ResponseError to LSPError', () => {
            const responseError = new ResponseError(-32601, 'Method not found');
            // Add data manually to simulate server response
            (responseError as any).data = { serverInfo: 'test' };

            const lspError = convertResponseError(
                responseError,
                'textDocument/completion',
            );

            assert.ok(lspError instanceof LSPError);
            assert.strictEqual(lspError.code, ErrorCodes.MethodNotFound);
            assert.strictEqual(lspError.message, 'Method not found');
            assert.deepStrictEqual(lspError.data, { serverInfo: 'test' });
            assert.strictEqual(lspError.method, 'textDocument/completion');
        });

        it('should handle ResponseError without data', () => {
            const responseError = new ResponseError(
                ErrorCodes.InternalError,
                'Internal error',
            );
            const lspError = convertResponseError(responseError);

            assert.ok(lspError instanceof LSPError);
            assert.strictEqual(lspError.code, ErrorCodes.InternalError);
            assert.strictEqual(lspError.message, 'Internal error');
            assert.strictEqual(lspError.data, undefined);
            assert.strictEqual(lspError.method, undefined);
        });
    });

    describe('Error Normalization', () => {
        it('should preserve LSPError unchanged', () => {
            const original = new LSPError(
                'Test',
                ErrorCodes.InternalError,
                {},
                'test',
            );
            const normalized = normalizeError(original);

            assert.strictEqual(normalized, original);
        });

        it('should convert ResponseError to LSPError', () => {
            const responseError = new ResponseError(-32601, 'Method not found');
            const normalized = normalizeError(
                responseError,
                'textDocument/hover',
            );

            assert.ok(normalized instanceof LSPError);
            assert.strictEqual(normalized.code, ErrorCodes.MethodNotFound);
            assert.strictEqual(normalized.message, 'Method not found');
            assert.strictEqual(normalized.method, 'textDocument/hover');
        });

        it('should preserve regular Error unchanged', () => {
            const original = new Error('Regular error');
            const normalized = normalizeError(original);

            assert.strictEqual(normalized, original);
        });

        it('should convert unknown types to Error', () => {
            const testCases = [
                'string error',
                { message: 'object error' },
                123,
                null,
                undefined,
            ];

            testCases.forEach((testCase) => {
                const normalized = normalizeError(testCase);
                assert.ok(normalized instanceof Error);
                assert.strictEqual(normalized.message, String(testCase));
            });
        });
    });

    describe('Type Guards', () => {
        it('should correctly identify LSPError', () => {
            const lspError = new LSPError('Test', -32603);
            const regularError = new Error('Regular');
            const responseError = new ResponseError(-32601, 'Method not found');

            assert.ok(isLSPError(lspError));
            assert.ok(!isLSPError(regularError));
            assert.ok(!isLSPError(responseError));
            assert.ok(!isLSPError('string'));
            assert.ok(!isLSPError(null));
        });

        it('should correctly identify ResponseError', () => {
            const lspError = new LSPError('Test', -32603);
            const regularError = new Error('Regular');
            const responseError = new ResponseError(-32601, 'Method not found');

            assert.ok(!isResponseError(lspError));
            assert.ok(!isResponseError(regularError));
            assert.ok(isResponseError(responseError));
            assert.ok(!isResponseError('string'));
            assert.ok(!isResponseError(null));
        });
    });

    describe('Utility Functions', () => {
        it('should extract error messages safely', () => {
            const testCases = [
                [new Error('Error message'), 'Error message'],
                [
                    new LSPError('LSP message', ErrorCodes.InternalError),
                    'LSP message',
                ],
                [
                    new ResponseError(
                        ErrorCodes.MethodNotFound,
                        'Response message',
                    ),
                    'Response message',
                ],
                ['String error', 'String error'],
                [123, '123'],
                [null, 'null'],
                [undefined, 'undefined'],
            ];

            testCases.forEach(([input, expected]) => {
                assert.strictEqual(getErrorMessage(input), expected);
            });
        });

        it('should extract error codes safely', () => {
            const lspError = new LSPError('Test', ErrorCodes.InternalError);
            const responseError = new ResponseError(
                ErrorCodes.MethodNotFound,
                'Test',
            );
            const regularError = new Error('Test');

            assert.strictEqual(
                getErrorCode(lspError),
                ErrorCodes.InternalError,
            );
            assert.strictEqual(
                getErrorCode(responseError),
                ErrorCodes.MethodNotFound,
            );
            assert.strictEqual(getErrorCode(regularError), undefined);
            assert.strictEqual(getErrorCode('string'), undefined);
        });

        it('should identify cancellation errors from various sources', () => {
            const testCases = [
                [new LSPError('Test', LSPErrorCodes.RequestCancelled), true],
                [new LSPError('Test', LSPErrorCodes.ServerCancelled), true],
                [
                    new ResponseError(LSPErrorCodes.RequestCancelled, 'Test'),
                    true,
                ],
                [
                    new ResponseError(LSPErrorCodes.ServerCancelled, 'Test'),
                    true,
                ],
                [new Error('Request was cancelled'), true],
                [new Error('Operation cancelled'), true],
                [new Error('CANCEL detected'), true],
                [new LSPError('Test', ErrorCodes.InternalError), false],
                [new Error('Regular error'), false],
                ['string error', false],
            ];

            testCases.forEach(([input, expected]) => {
                assert.strictEqual(
                    isCancellationError(input),
                    expected,
                    `Failed for: ${input}`,
                );
            });
        });

        it('should determine retry logic correctly', () => {
            const shouldNotRetryList = [
                new LSPError('Test', LSPErrorCodes.RequestCancelled),
                new LSPError('Test', LSPErrorCodes.ServerCancelled),
                new LSPError('Test', ErrorCodes.MethodNotFound),
                new LSPError('Test', ErrorCodes.InvalidParams),
                new ResponseError(LSPErrorCodes.RequestCancelled, 'Test'),
                new ResponseError(ErrorCodes.MethodNotFound, 'Test'),
                new Error('Request cancelled'),
            ];

            const canRetryList = [
                new LSPError('Test', ErrorCodes.InternalError),
                new LSPError('Test', LSPErrorCodes.ContentModified),
                new ResponseError(ErrorCodes.InternalError, 'Test'),
                new Error('Network error'),
                'string error',
            ];

            shouldNotRetryList.forEach((error) => {
                assert.ok(
                    shouldNotRetryError(error),
                    `Should not retry: ${error}`,
                );
            });

            canRetryList.forEach((error) => {
                assert.ok(!shouldNotRetryError(error), `Can retry: ${error}`);
            });
        });
    });

    describe('Error Formatting', () => {
        it('should format LSPError for logging', () => {
            const error = new LSPError(
                'Test message',
                ErrorCodes.MethodNotFound,
                { info: 'test' },
                'textDocument/completion',
            );

            const formatted = formatErrorForLogging(error, 'TEST_CONTEXT');

            assert.ok(formatted.includes('[TEST_CONTEXT]'));
            assert.ok(formatted.includes('LSP Error: Test message'));
            assert.ok(formatted.includes('Code: -32601'));
            assert.ok(formatted.includes('Type: Method Not Found'));
            assert.ok(formatted.includes('Method: textDocument/completion'));
        });

        it('should format ResponseError for logging', () => {
            const error = new ResponseError(
                ErrorCodes.InternalError,
                'Internal error',
            );
            const formatted = formatErrorForLogging(error, 'SERVER');

            assert.ok(formatted.includes('[SERVER]'));
            assert.ok(formatted.includes('ResponseError: Internal error'));
            assert.ok(formatted.includes('Code: -32603'));
        });

        it('should format regular Error for logging', () => {
            const error = new Error('Regular error');
            const formatted = formatErrorForLogging(error);

            assert.ok(formatted.includes('Error: Regular error'));
            assert.ok(!formatted.includes('['));
        });

        it('should format unknown errors for logging', () => {
            const formatted = formatErrorForLogging('Unknown error', 'DEBUG');

            assert.ok(formatted.includes('[DEBUG]'));
            assert.ok(formatted.includes('Unknown error: Unknown error'));
        });
    });

    describe('LSPResult Integration', () => {
        it('should work with LSPError in success case', () => {
            const result = LSPResult.success('test data');

            assert.ok(result.isSuccess());
            assert.strictEqual(result.getValue(), 'test data');
        });

        it('should work with LSPError in error case', () => {
            const lspError = new LSPError(
                'Test error',
                ErrorCodes.InternalError,
            );
            const result = LSPResult.error(lspError);

            assert.ok(result.isError());
            assert.strictEqual(result.getError(), lspError);
        });

        it('should work with converted ResponseError', () => {
            const responseError = new ResponseError(-32601, 'Method not found');
            const normalizedError = normalizeError(
                responseError,
                'test/method',
            );
            const result = LSPResult.error(normalizedError);

            assert.ok(result.isError());
            const error = result.getError();
            assert.ok(isLSPError(error));
            if (isLSPError(error)) {
                assert.strictEqual(error.code, ErrorCodes.MethodNotFound);
                assert.strictEqual(error.message, 'Method not found');
                assert.strictEqual(error.method, 'test/method');
            }
        });

        it('should handle cancellation errors correctly', () => {
            const cancelledError = new LSPError(
                'Request cancelled',
                LSPErrorCodes.RequestCancelled,
            );
            const result = LSPResult.error(cancelledError);

            // The consumer can now check the error type
            const error = result.getError();
            assert.ok(isLSPError(error));
            if (isLSPError(error)) {
                assert.ok(error.isCancellation());
            }
        });

        it('should provide unified error handling in match pattern', () => {
            const lspError = new LSPError(
                'Test error',
                ErrorCodes.InternalError,
                {},
                'test/method',
            );
            const result = LSPResult.error(lspError);

            let capturedError: Error | undefined;
            result.handleResult({
                success: () => assert.fail('Should not be success'),
                error: (error) => {
                    capturedError = error;
                    // All errors are now Error instances
                    assert.ok(error instanceof Error);
                    // But we can still check if it's an LSPError
                    if (isLSPError(error)) {
                        assert.strictEqual(
                            error.code,
                            ErrorCodes.InternalError,
                        );
                        assert.strictEqual(error.method, 'test/method');
                    }
                },
            });

            assert.ok(capturedError);
            assert.strictEqual(capturedError, lspError);
        });
    });

    describe('Migration Benefits', () => {
        it('should demonstrate simplified error handling', () => {
            // Before: Had to check instanceof ResponseError vs Error
            // After: All errors are Error, but can check isLSPError for LSP-specific handling

            const errors = [
                new LSPError('LSP error', ErrorCodes.InternalError),
                new Error('JavaScript error'),
                normalizeError(
                    new ResponseError(
                        ErrorCodes.MethodNotFound,
                        'Method not found',
                    ),
                ),
            ];

            errors.forEach((error) => {
                // Unified handling - all are Error instances
                assert.ok(error instanceof Error);

                // Can get message uniformly
                const message = error.message;
                assert.ok(typeof message === 'string');

                // Can check for LSP-specific features if needed
                if (isLSPError(error)) {
                    // Has LSP-specific properties and methods
                    assert.ok(typeof error.code === 'number');
                    assert.ok(typeof error.getErrorType === 'function');
                }
            });
        });

        it('should preserve LSP error information', () => {
            const originalResponseError = new ResponseError(
                ErrorCodes.MethodNotFound,
                'Method not found',
            );
            // Add data manually to simulate server response
            (originalResponseError as any).data = { serverVersion: '1.0.0' };

            const convertedError = normalizeError(
                originalResponseError,
                'textDocument/hover',
            );

            // All LSP information is preserved
            assert.ok(isLSPError(convertedError));
            if (isLSPError(convertedError)) {
                assert.strictEqual(
                    convertedError.code,
                    ErrorCodes.MethodNotFound,
                );
                assert.strictEqual(convertedError.message, 'Method not found');
                assert.deepStrictEqual(convertedError.data, {
                    serverVersion: '1.0.0',
                });
                assert.strictEqual(convertedError.method, 'textDocument/hover');
                assert.strictEqual(
                    convertedError.getErrorType(),
                    'Method Not Found',
                );
            }
        });
    });
});
