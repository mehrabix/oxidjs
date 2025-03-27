/**
 * @jest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, jest, test } from '@jest/globals';
import { 
  createWorkflow,
  createSequentialWorkflow,
  createParallelWorkflow,
  createConditionalSteps,
  WorkflowStep,
  StepStatus,
  ReactiveWorkflow,
  WorkflowState,
  WorkflowOptions,
} from '../src/reactiveWorkflow';

// Remove duplicate import
// const { createConditionalSteps } = require('../src/reactiveWorkflow');

// Mock timers and provide delay helper
jest.useFakeTimers();
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Define step types for tests
type SimpleStepFn = () => Promise<string>;
type ContextStepFn<T = any> = (context: T) => Promise<string>;
type WorkflowContext = Record<string, any>;

// Define step context types
interface TestContext {
  step1?: string;
  flag?: boolean;
}

// Fix for all execute mocks - use a proper type cast
function createMockExecute(returnValue: string) {
  return jest.fn().mockImplementation(() => Promise.resolve(returnValue)) as jest.Mock<Promise<string>, [any?]>;
}

function createErrorMock(error: Error) {
  return jest.fn().mockImplementation(() => Promise.reject(error)) as jest.Mock<Promise<string>, [any?]>;
}

describe('Reactive Workflow', () => {
  describe('Basic workflow creation', () => {
    test('should create a workflow with proper initial state', () => {
      // Create a properly typed mock function
      const execute = jest.fn().mockImplementation(() => Promise.resolve('step1 result')) as jest.Mock<Promise<string>, [any?]>;
      
      const workflow = createWorkflow({
        name: 'Test Workflow',
        steps: [
          {
            id: 'step1',
            name: 'Step 1',
            execute
          }
        ],
        options: {
          initialContext: {}
        }
      });
      
      const state = workflow.state();
      
      expect(state.name).toBe('Test Workflow');
      expect(state.isRunning).toBe(false);
      expect(state.isCompleted).toBe(false);
      expect(state.isFailed).toBe(false);
      expect(state.context).toEqual({});
      expect(state.steps.step1).toBeDefined();
      expect(state.steps.step1.status).toBe('pending');
    });
    
    // Increase timeout for long-running tests
    test('should start a workflow and execute steps', async () => {
      const step1Execute = jest.fn().mockImplementation(() => Promise.resolve('step1 result')) as jest.Mock<Promise<string>, [any?]>;
      const step2Execute = jest.fn().mockImplementation((context: TestContext) => {
        if (context.step1) {
          return delay(10).then(() => `${context.step1} processed`);
        }
        return Promise.resolve('default result');
      }) as jest.Mock<Promise<string>, [TestContext]>;
      
      const workflow = createWorkflow({
        name: 'Test Workflow',
        steps: [
          {
            id: 'step1',
            name: 'Step 1',
            execute: step1Execute
          },
          {
            id: 'step2',
            name: 'Step 2',
            execute: step2Execute,
            dependencies: ['step1']
          }
        ],
        options: {
          initialContext: {} as TestContext
        }
      });
      
      // Start the workflow
      const resultPromise = workflow.start();
      
      // Initial state check
      expect(workflow.state().isRunning).toBe(true);
      
      // Complete all timers
      jest.runAllTimers();
      
      // Wait for completion
      const result = await resultPromise;
      
      // Verify the steps executed in order
      expect(step1Execute).toHaveBeenCalled();
      expect(step2Execute).toHaveBeenCalledWith(expect.objectContaining({ 
        step1: 'step1 result' 
      }));
      
      // Verify final state
      expect(workflow.state().isCompleted).toBe(true);
      expect(workflow.state().isRunning).toBe(false);
      expect(workflow.state().steps.step1.status).toBe('completed');
      expect(workflow.state().steps.step2.status).toBe('completed');
      
      // Verify the result contains both step results
      expect(result).toEqual(expect.objectContaining({
        step1: 'step1 result',
        step2: expect.stringContaining('processed')
      }));
    }, 10000); // Increase timeout to 10 seconds
  });
  
  describe('Step Dependencies', () => {
    test('should execute steps in correct dependency order', async () => {
      const executionOrder: string[] = [];
      
      const workflow = createWorkflow({
        name: 'Dependency Workflow',
        steps: [
          {
            id: 'step1',
            name: 'Step 1',
            execute: async () => {
              await delay(20);
              executionOrder.push('step1');
              return 'step1 result';
            }
          },
          {
            id: 'step2',
            name: 'Step 2',
            execute: async () => {
              await delay(10);
              executionOrder.push('step2');
              return 'step2 result';
            },
            dependencies: ['step1']
          },
          {
            id: 'step3',
            name: 'Step 3',
            execute: async () => {
              executionOrder.push('step3');
              return 'step3 result';
            },
            dependencies: ['step1']
          },
          {
            id: 'step4',
            name: 'Step 4',
            execute: async () => {
              executionOrder.push('step4');
              return 'step4 result';
            },
            dependencies: ['step2', 'step3']
          }
        ],
        options: {
          initialContext: {}
        }
      });
      
      await workflow.start();
      
      // Verify execution order respects dependencies
      expect(executionOrder.indexOf('step1')).toBeLessThan(executionOrder.indexOf('step2'));
      expect(executionOrder.indexOf('step1')).toBeLessThan(executionOrder.indexOf('step3'));
      expect(executionOrder.indexOf('step2')).toBeLessThan(executionOrder.indexOf('step4'));
      expect(executionOrder.indexOf('step3')).toBeLessThan(executionOrder.indexOf('step4'));
    });
  });
  
  describe('Parallel Execution', () => {
    test('should run steps in parallel when specified', async () => {
      const step1Start = jest.fn();
      const step2Start = jest.fn();
      
      const workflow = createWorkflow({
        name: 'Parallel Workflow',
        steps: [
          {
            id: 'step1',
            name: 'Step 1',
            execute: async () => {
              step1Start();
              await delay(50);
              return 'step1 result';
            },
            parallel: true
          },
          {
            id: 'step2',
            name: 'Step 2',
            execute: async () => {
              step2Start();
              await delay(30);
              return 'step2 result';
            },
            parallel: true
          }
        ],
        options: {
          initialContext: {},
          maxParallelSteps: 2
        }
      });
      
      const startTime = Date.now();
      await workflow.start();
      const duration = Date.now() - startTime;
      
      // Both steps should have started
      expect(step1Start).toHaveBeenCalled();
      expect(step2Start).toHaveBeenCalled();
      
      // Duration should be roughly the time of the longest step
      // We check if it's less than the sum of both steps
      expect(duration).toBeLessThan(80); // 50ms + 30ms - some margin
      
      // Verify both steps completed
      expect(workflow.state().steps.step1.status).toBe('completed');
      expect(workflow.state().steps.step2.status).toBe('completed');
    });
    
    test('should respect maxParallelSteps limit', async () => {
      const startTimes: Record<string, number> = {};
      
      const workflow = createWorkflow({
        name: 'Limited Parallel Workflow',
        steps: [
          {
            id: 'step1',
            name: 'Step 1',
            execute: async () => {
              startTimes.step1 = Date.now();
              await delay(30);
              return 'step1 result';
            },
            parallel: true
          },
          {
            id: 'step2',
            name: 'Step 2',
            execute: async () => {
              startTimes.step2 = Date.now();
              await delay(30);
              return 'step2 result';
            },
            parallel: true
          },
          {
            id: 'step3',
            name: 'Step 3',
            execute: async () => {
              startTimes.step3 = Date.now();
              await delay(30);
              return 'step3 result';
            },
            parallel: true
          }
        ],
        options: {
          initialContext: {},
          maxParallelSteps: 2
        }
      });
      
      await workflow.start();
      
      // First two steps should start together
      expect(startTimes.step1).toBeDefined();
      expect(startTimes.step2).toBeDefined();
      
      // Third step should start later
      expect(startTimes.step3 - startTimes.step1).toBeGreaterThanOrEqual(20);
    });
  });
  
  describe('Conditional Steps', () => {
    test('should skip steps when condition is false', async () => {
      const step1Execute = jest.fn((context?: any) => Promise.resolve('step1 result'));
      const step2Execute = jest.fn((context?: any) => Promise.resolve('step2 result'));
      
      const workflow = createWorkflow({
        name: 'Conditional Workflow',
        steps: [
          {
            id: 'step1',
            name: 'Step 1',
            execute: step1Execute,
            condition: (context) => context.flag === true
          },
          {
            id: 'step2',
            name: 'Step 2',
            execute: step2Execute,
            condition: (context) => context.flag === true
          }
        ],
        options: {
          initialContext: { flag: false }
        }
      });
      
      await workflow.start();
      
      // Step 1 should execute
      expect(step1Execute).toHaveBeenCalled();
      
      // Step 2 should be skipped because flag is false
      expect(step2Execute).not.toHaveBeenCalled();
      expect(workflow.state().steps.step2.status).toBe('skipped');
      expect(workflow.state().skippedSteps).toContain('step2');
    });
    
    test('should run steps when condition is true', async () => {
      const step1Execute = jest.fn((context?: any) => Promise.resolve('step1 result'));
      const step2Execute = jest.fn((context?: any) => Promise.resolve('step2 result'));
      
      const workflow = createWorkflow({
        name: 'Conditional Workflow',
        steps: [
          {
            id: 'step1',
            name: 'Step 1',
            execute: step1Execute,
            condition: (context) => context.flag === true
          },
          {
            id: 'step2',
            name: 'Step 2',
            execute: step2Execute,
            condition: (context) => context.flag === true
          }
        ],
        options: {
          initialContext: { flag: true }
        }
      });
      
      await workflow.start();
      
      // Step 1 should execute because flag is true
      expect(step1Execute).toHaveBeenCalled();
      expect(workflow.state().steps.step1.status).toBe('completed');
    });
    
    test('should create conditional steps with createConditionalSteps', async () => {
      const thenStep: WorkflowStep = {
        id: 'thenStep',
        name: 'Then Step',
        execute: jest.fn((context: any) => Promise.resolve('then result'))
      };
      
      const elseStep: WorkflowStep = {
        id: 'elseStep',
        name: 'Else Step',
        execute: jest.fn((context: any) => Promise.resolve('else result'))
      };
      
      // Create workflow with true condition
      const workflowTrue = createWorkflow({
        name: 'Conditional Workflow True',
        steps: createConditionalSteps(
          (context) => context.flag === true,
          [thenStep],
          [elseStep]
        ),
        options: {
          initialContext: { flag: true }
        }
      });
      
      await workflowTrue.start();
      
      // Then step should execute, else step should be skipped
      expect(workflowTrue.state().steps.thenStep.status).toBe('completed');
      expect(workflowTrue.state().steps.elseStep.status).toBe('skipped');
      
      // Reset mocks
      jest.clearAllMocks();
      
      // Create workflow with false condition
      const workflowFalse = createWorkflow({
        name: 'Conditional Workflow False',
        steps: createConditionalSteps(
          (context) => context.flag === true,
          [thenStep],
          [elseStep]
        ),
        options: {
          initialContext: { flag: false }
        }
      });
      
      await workflowFalse.start();
      
      // Then step should be skipped, else step should execute
      expect(workflowFalse.state().steps.thenStep.status).toBe('skipped');
      expect(workflowFalse.state().steps.elseStep.status).toBe('completed');
    });
  });
  
  describe('Error Handling', () => {
    test('should mark step as failed when it throws error', async () => {
      const error = new Error('Step failed');
      const errorHandler = jest.fn();
      
      const workflow = createWorkflow({
        name: 'Error Workflow',
        steps: [
          {
            id: 'step1',
            name: 'Step 1',
            execute: () => Promise.reject(error),
            onError: errorHandler
          }
        ],
        options: {
          initialContext: {},
          continueOnFailure: false
        }
      });
      
      try {
        await workflow.start();
        fail('Workflow should have thrown an error');
      } catch (e) {
        // Error should be bubbled up
        expect(e).toBe(error);
      }
      
      // Step should be marked as failed
      expect(workflow.state().steps.step1.status).toBe('failed');
      expect(workflow.state().steps.step1.error).toBe(error);
      expect(workflow.state().failedSteps).toContain('step1');
      
      // Error handler should be called
      expect(errorHandler).toHaveBeenCalledWith(error, expect.anything());
      
      // Workflow should be marked as failed
      expect(workflow.state().isFailed).toBe(true);
    });
    
    test('should continue on failure when configured', async () => {
      const step1Execute = jest.fn((context?: any) => Promise.reject(new Error('Step 1 failed')));
      const step2Execute = jest.fn((context?: any) => Promise.resolve('step2 result'));
      
      const workflow = createWorkflow({
        name: 'Continue On Failure Workflow',
        steps: [
          {
            id: 'step1',
            name: 'Step 1',
            execute: step1Execute
          },
          {
            id: 'step2',
            name: 'Step 2',
            execute: step2Execute
          }
        ],
        options: {
          initialContext: {},
          continueOnFailure: true
        }
      });
      
      await workflow.start();
      
      // Step 1 should be marked as failed
      expect(workflow.state().steps.step1.status).toBe('failed');
      
      // Step 2 should still execute and complete
      expect(step2Execute).toHaveBeenCalled();
      expect(workflow.state().steps.step2.status).toBe('completed');
      
      // Workflow should be marked as completed, not failed
      expect(workflow.state().isCompleted).toBe(true);
      expect(workflow.state().isFailed).toBe(false);
    });
    
    test('should retry failed steps', async () => {
      let attempts = 0;
      const step1Execute = jest.fn((context?: any) => {
        if (attempts === 0) {
          attempts++;
          return Promise.reject(new Error('First attempt failed'));
        }
        return Promise.resolve('step1 result');
      });
      
      const workflow = createWorkflow({
        name: 'Retry Workflow',
        steps: [
          {
            id: 'step1',
            name: 'Step 1',
            execute: step1Execute,
            retryAttempts: 1,
            retryDelay: 10
          }
        ],
        options: {
          initialContext: {}
        }
      });
      
      await workflow.start();
      
      // Execute should be called twice (original + retry)
      expect(step1Execute).toHaveBeenCalledTimes(2);
      
      // Step should be completed after retry
      expect(workflow.state().steps.step1.status).toBe('completed');
      expect(workflow.state().steps.step1.attempts).toBe(2);
    });
    
    test('should retry specific steps', async () => {
      // Create workflow with failing step
      let shouldFail = true;
      const failingStep = jest.fn((context?: any) => {
        if (shouldFail) {
          return Promise.reject(new Error('Step failed'));
        }
        return Promise.resolve('success after retry');
      });
      
      const retryWorkflow = createWorkflow({
        name: 'Retry Workflow',
        steps: [
          {
            id: 'failingStep',
            name: 'Failing Step',
            execute: failingStep
          }
        ],
        options: {
          initialContext: {},
          continueOnFailure: true
        }
      });
      
      // Start and wait for failure
      await retryWorkflow.start();
      
      // Should be failed
      expect(retryWorkflow.state().steps.failingStep.status).toBe('failed');
      
      // Make the next call succeed
      shouldFail = false;
      
      // Retry the step
      await retryWorkflow.retryStep('failingStep');
      
      // Should now be completed
      expect(retryWorkflow.state().steps.failingStep.status).toBe('completed');
      expect(retryWorkflow.state().steps.failingStep.result).toBe('success after retry');
      
      // Should have been called twice (original + retry)
      expect(failingStep).toHaveBeenCalledTimes(2);
    });
  });
  
  describe('Workflow Control', () => {
    let workflow: ReactiveWorkflow;
    let step1: jest.Mock;
    let step2: jest.Mock;
    
    beforeEach(() => {
      step1 = jest.fn((_context?: any) => Promise.resolve('step1 result'));
      
      step2 = jest.fn((_context?: any) => Promise.resolve('step2 result'));
      
      workflow = createWorkflow({
        name: 'Control Workflow',
        steps: [
          {
            id: 'step1',
            name: 'Step 1',
            execute: step1
          },
          {
            id: 'step2',
            name: 'Step 2',
            execute: step2,
            dependencies: ['step1']
          }
        ],
        options: {
          initialContext: {}
        }
      });
    });
    
    test('should pause and resume workflow', async () => {
      // Start workflow
      const promise = workflow.start();
      
      // Wait a bit for step1 to start
      await delay(10);
      
      // Pause the workflow
      workflow.pause();
      
      // Should be paused
      expect(workflow.state().isRunning).toBe(false);
      
      // Step 1 might have completed if it was quick, but step 2 shouldn't start
      const initialStep2Status = workflow.state().steps.step2.status;
      
      // Wait a bit to ensure step2 doesn't start
      await delay(20);
      
      // Step 2 status should not have changed
      expect(workflow.state().steps.step2.status).toBe(initialStep2Status);
      
      // Resume the workflow
      workflow.resume();
      
      // Should be running again
      expect(workflow.state().isRunning).toBe(true);
      
      // Wait for completion
      await promise;
      
      // Both steps should complete
      expect(workflow.state().steps.step1.status).toBe('completed');
      expect(workflow.state().steps.step2.status).toBe('completed');
    });
    
    test('should stop workflow', async () => {
      // Start workflow
      const promise = workflow.start();
      
      // Wait a bit for step1 to start
      await delay(10);
      
      // Stop the workflow
      workflow.stop();
      
      // Should not be running
      expect(workflow.state().isRunning).toBe(false);
      
      // Try to await - should reject or resolve
      try {
        await promise;
      } catch (e) {
        // This is fine - workflow was stopped
      }
      
      // Workflow should not complete
      expect(workflow.state().isCompleted).toBe(false);
    });
    
    test('should skip a step', async () => {
      // Start workflow but immediately pause
      workflow.start();
      workflow.pause();
      
      // Skip step 1
      workflow.skipStep('step1');
      
      // Resume workflow
      workflow.resume();
      
      // Wait for completion
      await delay(100);
      
      // Step 1 should be skipped but step 2 should run
      expect(workflow.state().steps.step1.status).toBe('skipped');
      expect(workflow.state().steps.step2.status).toBe('completed');
      
      // Step 1 should not have been executed
      expect(step1).not.toHaveBeenCalled();
      
      // Step 2 should have been executed
      expect(step2).toHaveBeenCalled();
    });
    
    test('should retry a failed step', async () => {
      // Create workflow with failing step
      const failingStep = jest.fn((_context?: any) => Promise.reject(new Error('Step failed')));
      
      const retryWorkflow = createWorkflow({
        name: 'Retry Workflow',
        steps: [
          {
            id: 'failingStep',
            name: 'Failing Step',
            execute: failingStep
          }
        ],
        options: {
          initialContext: {},
          continueOnFailure: true
        }
      });
      
      // Start and wait for failure
      await retryWorkflow.start();
      
      // Should be failed
      expect(retryWorkflow.state().steps.failingStep.status).toBe('failed');
      
      // Replace mock implementation to succeed on retry
      failingStep.mockImplementationOnce((_context?: any) => Promise.resolve('success after retry'));
      
      // Retry the step
      await retryWorkflow.retryStep('failingStep');
      
      // Should now be completed
      expect(retryWorkflow.state().steps.failingStep.status).toBe('completed');
      expect(retryWorkflow.state().steps.failingStep.result).toBe('success after retry');
      
      // Should have been called twice (original + retry)
      expect(failingStep).toHaveBeenCalledTimes(2);
    });
    
    test('should update context', async () => {
      workflow.updateContext(context => ({ ...context, newValue: 'test' }));
      
      expect(workflow.state().context.newValue).toBe('test');
    });
  });
  
  describe('Sequential and Parallel Workflow Factories', () => {
    test('should create a sequential workflow', async () => {
      const executionOrder: string[] = [];
      
      interface TestContext {
        step0?: string;
        step1?: string;
      }
      
      const workflow = createSequentialWorkflow<TestContext>([
        async () => {
          await delay(20);
          executionOrder.push('step1');
          return 'step1 result';
        },
        async (context: TestContext) => {
          executionOrder.push('step2');
          return context.step0 + ' processed';
        }
      ], {
        initialContext: {} as TestContext
      });
      
      await workflow.start();
      
      // Steps should execute in order
      expect(executionOrder).toEqual(['step1', 'step2']);
      
      // Results should be in context
      expect(workflow.state().context.step0).toBe('step1 result');
      expect(workflow.state().context.step1).toBe('step1 result processed');
    });
    
    test('should create a parallel workflow', async () => {
      const executionOrder: string[] = [];
      
      interface TestContext {
        step0?: string;
        step1?: string;
      }
      
      const workflow = createParallelWorkflow<TestContext>([
        async () => {
          await delay(20);
          executionOrder.push('step1');
          return 'step1 result';
        },
        async () => {
          await delay(10);
          executionOrder.push('step2');
          return 'step2 result';
        }
      ], {
        initialContext: {} as TestContext
      });
      
      const startPromise = workflow.start();
      
      // Both steps should be running
      expect(workflow.state().runningSteps.length).toBe(2);
      
      // Fast-forward timers
      jest.advanceTimersByTime(20);
      
      await startPromise;
      
      // Second step should complete first (it's faster)
      expect(executionOrder).toEqual(['step2', 'step1']);
      expect(workflow.state().isCompleted).toBe(true);
      
      // Results should be in context
      expect(workflow.state().context.step0).toBe('step1 result');
      expect(workflow.state().context.step1).toBe('step2 result');
    });
  });
  
  describe('Event Subscriptions', () => {
    test('should notify when a step changes status', async () => {
      const workflow = createWorkflow({
        name: 'Event Workflow',
        steps: [
          {
            id: 'step1',
            name: 'Step 1',
            execute: async () => {
              await delay(10);
              return 'step1 result';
            }
          }
        ],
        options: {
          initialContext: {}
        }
      });
      
      const statusChanges: StepStatus[] = [];
      const unsubscribe = workflow.onStepChange('step1', (info) => {
        statusChanges.push(info.status);
      });
      
      await workflow.start();
      
      // Should have recorded status changes
      expect(statusChanges.length).toBeGreaterThanOrEqual(2);
      expect(statusChanges).toContain('running');
      expect(statusChanges).toContain('completed');
      
      // Cleanup
      unsubscribe();
    });
    
    test('should notify on workflow completion', async () => {
      const workflow = createWorkflow({
        name: 'Completion Workflow',
        steps: [
          {
            id: 'step1',
            name: 'Step 1',
            execute: () => 'step1 result'
          }
        ],
        options: {
          initialContext: {}
        }
      });
      
      const completionHandler = jest.fn();
      const unsubscribe = workflow.onComplete(completionHandler);
      
      await workflow.start();
      
      // Should be called with final context
      expect(completionHandler).toHaveBeenCalledWith(
        expect.objectContaining({ step1: 'step1 result' })
      );
      
      // Cleanup
      unsubscribe();
    });
  });
}); 