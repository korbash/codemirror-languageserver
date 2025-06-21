/**
 * Simplified Error Handling Tests
 *
 * Tests for the simplified LSP error system using LSPError (single error) and LSPResult (array of errors)
 */

import { strict as assert } from 'assert';
import {
    ResponseError,
    LSPErrorCodes,
    ErrorCodes,
} from 'vscode-languageserver-protocol';
import {
    LSPError,
    normalizeError,
    isCancellationError,
    shouldNotRetryError,
    createServerNotInitializedError,
    createNoConnectionError,
    createCancelledError,
    createTimeoutError,
    createLSPErrorFromError,
    createGenericError,
} from '../types/ErrorConverter.js';
import { Result, Ok, Err } from 'ts-results-es';

describe('Simplified Error Handling', () => {
    describe('LSPError Class', () => {
        it('should create LSPError with basic properties', () => {
            const error = new LSPError(
                'Test error message',
                ErrorCodes.MethodNotFound,
                'textDocument/completion',
                { additional: 'data' },
            );

            assert.strictEqual(error.name, 'LSPError');
            assert.strictEqual(error.message, 'Test error message');
            assert.strictEqual(error.code, ErrorCodes.MethodNotFound);
            assert.strictEqual(error.method, 'textDocument/completion');
            assert.deepStrictEqual(error.data, { additional: 'data' });
            assert.ok(error instanceof Error);
            assert.ok(error instanceof LSPError);
        });

        it('should determine correct error types', () => {
            const cancelledError = new LSPError(
                'Cancelled',
                LSPErrorCodes.RequestCancelled,
            );
            const serverCancelledError = new LSPError(
                'Server cancelled',
                LSPErrorCodes.ServerCancelled,
            );
            const genericError = new LSPError(
                'Generic error',
                ErrorCodes.InternalError,
            );

            assert.strictEqual(cancelledError.getType(), 'cancelled');
            assert.strictEqual(serverCancelledError.getType(), 'cancelled');
            assert.strictEqual(genericError.getType(), 'error');
        });

        it('should determine retry logic correctly', () => {
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
                    `${error.message} should not retry`,
                );
            });

            canRetryErrors.forEach((error) => {
                assert.ok(
                    !error.shouldNotRetry(),
                    `${error.message} should allow retry`,
                );
            });
        });

        it('should create LSPError from ResponseError', () => {
            const responseError = new ResponseError(
                ErrorCodes.MethodNotFound,
                'Method not found',
            );
            (responseError as any).data = { serverInfo: 'test' };

            const lspError = LSPError.fromResponseError(
                responseError,
                'textDocument/hover',
            );

            assert.ok(lspError instanceof LSPError);
            assert.strictEqual(lspError.code, ErrorCodes.MethodNotFound);
            assert.strictEqual(lspError.message, 'Method not found');
            assert.strictEqual(lspError.method, 'textDocument/hover');
            assert.deepStrictEqual(lspError.data, { serverInfo: 'test' });
        });
    });

    describe('normalizeError Function', () => {
        it('should preserve LSPError unchanged', () => {
            const original = new LSPError(
                'Test',
                ErrorCodes.InternalError,
                'test/method',
                {},
            );
            const normalized = normalizeError(original);

            assert.strictEqual(normalized, original);
        });

        it('should convert ResponseError to LSPError', () => {
            const responseError = new ResponseError(
                ErrorCodes.MethodNotFound,
                'Method not found',
            );
            (responseError as any).data = { test: 'data' };

            const normalized = normalizeError(
                responseError,
                'textDocument/hover',
            );

            assert.ok(normalized instanceof LSPError);
            assert.strictEqual(normalized.code, ErrorCodes.MethodNotFound);
            assert.strictEqual(normalized.message, 'Method not found');
            assert.strictEqual(normalized.method, 'textDocument/hover');
            assert.deepStrictEqual(normalized.data, { test: 'data' });
        });

        it('should convert regular Error to LSPError', () => {
            const regularError = new Error('Regular error');
            const normalized = normalizeError(regularError, 'test/method');

            assert.ok(normalized instanceof LSPError);
            assert.strictEqual(normalized.message, 'Regular error');
            assert.strictEqual(normalized.code, ErrorCodes.InternalError);
            assert.strictEqual(normalized.method, 'test/method');
        });

        it('should convert unknown types to LSPError', () => {
            const testCases = [
                'string error',
                { message: 'object error' },
                123,
                null,
                undefined,
            ];

            testCases.forEach((testCase) => {
                const normalized = normalizeError(testCase);
                assert.ok(normalized instanceof LSPError);
                assert.strictEqual(normalized.message, String(testCase));
                assert.strictEqual(normalized.code, ErrorCodes.InternalError);
            });
        });
    });

    describe('Error Classification Functions', () => {
        it('should identify cancellation errors', () => {
            const cancelledError = new LSPError(
                'Cancelled',
                LSPErrorCodes.RequestCancelled,
            );
            const serverCancelledError = new LSPError(
                'Server cancelled',
                LSPErrorCodes.ServerCancelled,
            );
            const regularCancelError = new Error('Request was cancelled');
            const otherError = new LSPError(
                'Other error',
                ErrorCodes.InternalError,
            );

            assert.ok(isCancellationError(cancelledError));
            assert.ok(isCancellationError(serverCancelledError));
            assert.ok(isCancellationError(regularCancelError));
            assert.ok(!isCancellationError(otherError));
        });

        it('should determine retry logic for different error types', () => {
            const shouldNotRetryErrors = [
                new LSPError('Cancelled', LSPErrorCodes.RequestCancelled),
                new LSPError('Server cancelled', LSPErrorCodes.ServerCancelled),
                new LSPError('Method not found', ErrorCodes.MethodNotFound),
                new LSPError('Invalid params', ErrorCodes.InvalidParams),
                new Error('Request cancelled'),
            ];

            const canRetryErrors = [
                new LSPError('Internal error', ErrorCodes.InternalError),
                new LSPError('Content modified', LSPErrorCodes.ContentModified),
                new Error('Network error'),
            ];

            shouldNotRetryErrors.forEach((error) => {
                assert.ok(
                    shouldNotRetryError(error),
                    `Should not retry: ${error.message}`,
                );
            });

            canRetryErrors.forEach((error) => {
                assert.ok(
                    !shouldNotRetryError(error),
                    `Should retry: ${error.message}`,
                );
            });
        });
    });

    describe('Utility Error Creation Functions', () => {
        it('should create server not initialized error', () => {
            const error = createServerNotInitializedError('testMethod');

            assert.ok(error instanceof LSPError);
            assert.strictEqual(error.message, 'Server not initialized');
            assert.strictEqual(error.code, ErrorCodes.ServerNotInitialized);
            assert.strictEqual(error.method, 'testMethod');
        });

        it('should create no connection error', () => {
            const error = createNoConnectionError('testMethod');

            assert.ok(error instanceof LSPError);
            assert.strictEqual(error.message, 'No active connection');
            assert.strictEqual(error.code, ErrorCodes.InternalError);
            assert.strictEqual(error.method, 'testMethod');
        });

        it('should create cancelled error', () => {
            const error = createCancelledError('Custom reason', 'testMethod');

            assert.ok(error instanceof LSPError);
            assert.strictEqual(error.message, 'Custom reason');
            assert.strictEqual(error.code, LSPErrorCodes.RequestCancelled);
            assert.strictEqual(error.method, 'testMethod');
        });

        it('should create timeout error', () => {
            const error = createTimeoutError('Custom timeout', 'testMethod');

            assert.ok(error instanceof LSPError);
            assert.strictEqual(error.message, 'Custom timeout');
            assert.strictEqual(error.code, ErrorCodes.InternalError);
            assert.strictEqual(error.method, 'testMethod');
        });

        it('should create LSPError from regular Error', () => {
            const originalError = new Error('Original message');
            const lspError = createLSPErrorFromError(
                originalError,
                'testMethod',
            );

            assert.ok(lspError instanceof LSPError);
            assert.strictEqual(lspError.message, 'Original message');
            assert.strictEqual(lspError.code, ErrorCodes.InternalError);
            assert.strictEqual(lspError.method, 'testMethod');
        });

        it('should create generic error', () => {
            const error = createGenericError(
                'Generic message',
                'testMethod',
                ErrorCodes.ParseError,
            );

            assert.ok(error instanceof LSPError);
            assert.strictEqual(error.message, 'Generic message');
            assert.strictEqual(error.code, ErrorCodes.ParseError);
            assert.strictEqual(error.method, 'testMethod');
        });
    });

    describe('Result Integration', () => {
        it('should create successful Result', () => {
            const result: Result<string, LSPError[]> = Ok('test data');

            assert.ok(result.isOk());
            assert.strictEqual(result.unwrap(), 'test data');
            assert.ok(!result.isErr());
        });

        it('should create error Result with single error', () => {
            const lspError = new LSPError(
                'Test error',
                ErrorCodes.InternalError,
                'test/method',
            );
            const result: Result<string, LSPError[]> = Err([lspError]);

            assert.ok(result.isErr());
            assert.ok(!result.isOk());
            const errors = result.unwrapErr();
            assert.strictEqual(errors.length, 1);
            assert.strictEqual(errors[0], lspError);

            assert.throws(() => result.unwrap(), /Tried to unwrap Error/);
        });

        it('should create error LSPResult with multiple errors', () => {
            const errors = [
                new LSPError('First error', ErrorCodes.InternalError),
                new Error('Second error'),
                new LSPError('Third error', ErrorCodes.ParseError),
            ];
            const result = LSPResult.error(errors);

            assert.ok(!result.isSuccess());
            assert.strictEqual(result.getErrorCount(), 3);
            assert.strictEqual(result.getFirstError(), errors[0]);
            assert.ok(result.hasLSPError());
            assert.strictEqual(result.getFirstLSPError(), errors[0]);

            const retrievedErrors = result.getErrors();
            assert.strictEqual(retrievedErrors.length, 3);
            assert.notStrictEqual(retrievedErrors, errors); // Should be a copy
        });

        it('should handle result with callbacks', () => {
            const successResult = LSPResult.success('success data');
            const errorResult = LSPResult.singleError(
                new LSPError('Error', ErrorCodes.InternalError),
            );

            const successValue = successResult.handle(
                (value) => `Processed: ${value}`,
                (errors) => `Error count: ${errors.length}`,
            );

            const errorValue = errorResult.handle(
                (value) => `Processed: ${value}`,
                (errors) => `Error count: ${errors.length}`,
            );

            assert.strictEqual(successValue, 'Processed: success data');
            assert.strictEqual(errorValue, 'Error count: 1');
        });

        it('should map successful values', () => {
            const result: Result<number, LSPError[]> = Ok(5);
            const mapped = result.map((value) => value * 2);

            assert.ok(mapped.isOk());
            assert.strictEqual(mapped.unwrap(), 10);
        });

        it('should not map error values', () => {
            const error = new LSPError(
                'Test',
                ErrorCodes.InternalError,
                'test',
            );
            const result: Result<number, LSPError[]> = Err([error]);
            const mapped = result.map((value: number) => value * 2);

            assert.ok(mapped.isErr());
            assert.strictEqual(mapped.unwrapErr()[0], error);
        });

        it('should chain operations with andThen', () => {
            const result: Result<number, LSPError[]> = Ok(5);
            const chained = result.andThen((x) =>
                x > 0
                    ? Ok(x * 2)
                    : Err([
                          new LSPError(
                              'Negative number',
                              ErrorCodes.InvalidParams,
                              'test',
                          ),
                      ]),
            );

            assert.ok(chained.isOk());
            assert.strictEqual(chained.unwrap(), 10);
        });

        it('should provide default values', () => {
            const successResult: Result<string, LSPError[]> = Ok('success');
            const errorResult: Result<string, LSPError[]> = Err([
                new LSPError('Error', ErrorCodes.InternalError, 'test'),
            ]);

            assert.strictEqual(successResult.unwrapOr('default'), 'success');
            assert.strictEqual(errorResult.unwrapOr('default'), 'default');
        });

        it('should handle Result conversion patterns', async () => {
            const successResult: Result<string, LSPError[]> = Ok('success');
            const errorResult: Result<string, LSPError[]> = Err([
                new LSPError('Error', ErrorCodes.InternalError, 'test'),
            ]);

            // Success case
            if (successResult.isOk()) {
                const value = successResult.unwrap();
                assert.strictEqual(value, 'success');
            } else {
                assert.fail('Should be Ok');
            }

            // Error case
            if (errorResult.isErr()) {
                const errors = errorResult.unwrapErr();
                assert.ok(errors.length > 0);
                assert.ok(errors[0] instanceof LSPError);
            } else {
                assert.fail('Should be Err');
            }
        });

        it('should handle Result pattern matching', () => {
            const successResult: Result<string, LSPError[]> = Ok('test');
            const errorResult: Result<string, LSPError[]> = Err([
                new LSPError('Test error', ErrorCodes.InternalError, 'test'),
            ]);

            let successCalled = false;
            let errorCalled = false;

            // Handle success case
            if (successResult.isOk()) {
                successCalled = true;
                const value = successResult.unwrap();
                assert.strictEqual(value, 'test');
            } else {
                assert.fail('Should not be error');
            }

            // Handle error case
            if (errorResult.isErr()) {
                errorCalled = true;
                const errors = errorResult.unwrapErr();
                assert.strictEqual(errors.length, 1);
                assert.ok(errors[0] instanceof LSPError);
            } else {
                assert.fail('Should not be success');
            }

            assert.ok(successCalled);
            assert.ok(errorCalled);
        });

        it('should determine result state', () => {
            const successResult: Result<string, LSPError[]> = Ok('test');
            const cancelledResult: Result<string, LSPError[]> = Err([
                new LSPError(
                    'Cancelled',
                    LSPErrorCodes.RequestCancelled,
                    'test',
                ),
            ]);
            const errorResult: Result<string, LSPError[]> = Err([
                new LSPError('Error', ErrorCodes.InternalError, 'test'),
            ]);

            // Check success state
            assert.ok(successResult.isOk());
            assert.ok(!successResult.isErr());

            // Check cancelled state by examining error code
            assert.ok(cancelledResult.isErr());
            const cancelledErrors = cancelledResult.unwrapErr();
            assert.ok(isCancellationError(cancelledErrors[0]));

            // Check error state
            assert.ok(errorResult.isErr());
            const errors = errorResult.unwrapErr();
            assert.ok(!isCancellationError(errors[0]));
        });

        it('should handle error logging patterns', () => {
            const originalConsoleError = console.error;
            const logs: string[] = [];
            console.error = (...args: any[]) => {
                logs.push(args.join(' '));
            };

            try {
                const result: Result<string, LSPError[]> = Err([
                    new LSPError(
                        'First error',
                        ErrorCodes.InternalError,
                        'test/method',
                    ),
                    new LSPError(
                        'Second error',
                        ErrorCodes.InternalError,
                        'test/method',
                    ),
                ]);

                // Custom logging pattern for Result
                if (result.isErr()) {
                    const errors = result.unwrapErr();
                    console.error(
                        'TEST_CONTEXT:',
                        errors.map((e) => e.message).join(', '),
                    );
                }

                assert.ok(logs.length > 0);
                assert.ok(logs[0].includes('TEST_CONTEXT:'));
                assert.ok(logs[0].includes('First error'));
            } finally {
                console.error = originalConsoleError;
            }
        });
    });

    describe('Real-world Integration Scenarios', () => {
        it('should handle complete request failure scenario', () => {
            const errors = [
                new ResponseError(
                    ErrorCodes.InternalError,
                    'Server overloaded',
                ),
                new Error('Connection timeout'),
                new Error('Network unreachable'),
            ];

            // Convert to LSPErrors
            const lspErrors = errors.map((error) =>
                normalizeError(error, 'textDocument/completion'),
            );
            const result: Result<any, LSPError[]> = Err(lspErrors);

            assert.ok(result.isErr());
            const resultErrors = result.unwrapErr();
            assert.strictEqual(resultErrors.length, 3);
            assert.ok(resultErrors.every((error) => error instanceof LSPError));

            const firstError = resultErrors[0];
            assert.ok(firstError);
            assert.strictEqual(firstError.code, ErrorCodes.InternalError);
            assert.strictEqual(firstError.method, 'textDocument/completion');
        });

        it('should handle method not found error', () => {
            const responseError = new ResponseError(
                ErrorCodes.MethodNotFound,
                'textDocument/semanticTokens not supported',
            );
            const lspError = normalizeError(
                responseError,
                'textDocument/semanticTokens',
            );
            const result: Result<any, LSPError[]> = Err([lspError]);

            assert.ok(result.isErr());
            assert.ok(shouldNotRetryError(lspError)); // Should not retry unsupported methods
            assert.strictEqual(
                result.unwrapErr()[0].message,
                'textDocument/semanticTokens not supported',
            );
        });

        it('should handle cancellation scenarios', () => {
            const cancelledError = new LSPError(
                'Request was cancelled by user',
                LSPErrorCodes.RequestCancelled,
                'textDocument/completion',
            );
            const result: Result<any, LSPError[]> = Err([cancelledError]);

            assert.ok(result.isErr());
            const errors = result.unwrapErr();
            assert.ok(isCancellationError(errors[0]));
        });
    });
});
