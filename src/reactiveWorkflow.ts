import { createSignalPair, ReadonlySignal } from './signal';
import { createEffect } from './effect';
import { batch } from './utils';

/**
 * The status of a workflow step
 */
export type StepStatus = 
  | 'pending'  // Not yet started
  | 'running'  // Currently executing
  | 'completed' // Successfully completed
  | 'failed'   // Failed execution
  | 'skipped';  // Skipped due to conditions

/**
 * Defines a step in a workflow
 */
export interface WorkflowStep<TContext = any, TResult = any> {
  /** Unique identifier for the step */
  id: string;
  /** Human-readable name of this step */
  name: string;
  /** Function to execute for this step */
  execute: (context: TContext) => Promise<TResult> | TResult;
  /** Optional condition to determine if this step should run */
  condition?: (context: TContext) => boolean;
  /** Steps that must complete before this step can run */
  dependencies?: string[];
  /** Maximum retry attempts if this step fails */
  retryAttempts?: number;
  /** Delay between retry attempts in milliseconds */
  retryDelay?: number;
  /** Whether to run this step in parallel with other steps */
  parallel?: boolean;
  /** Optional timeout for this step in milliseconds */
  timeout?: number;
  /** Custom error handler */
  onError?: (error: any, context: TContext) => void;
  /** Custom success handler */
  onSuccess?: (result: TResult, context: TContext) => void;
}

/**
 * Information about a running workflow step
 */
export interface StepInfo<TResult = any> {
  /** Step ID */
  id: string;
  /** Step name */
  name: string;
  /** Current status */
  status: StepStatus;
  /** Start time */
  startTime?: number;
  /** End time */
  endTime?: number;
  /** Duration in milliseconds */
  duration?: number;
  /** Error if failed */
  error?: any;
  /** Result if completed */
  result?: TResult;
  /** Number of retry attempts made */
  attempts: number;
}

/**
 * Workflow state
 */
export interface WorkflowState<TContext = any> {
  /** Unique ID of this workflow execution */
  id: string;
  /** Workflow name */
  name: string;
  /** Whether the workflow is currently running */
  isRunning: boolean;
  /** Whether the workflow has completed */
  isCompleted: boolean;
  /** Whether the workflow has failed */
  isFailed: boolean;
  /** Start time */
  startTime?: number;
  /** End time */
  endTime?: number;
  /** Duration in milliseconds */
  duration?: number;
  /** Current workflow context */
  context: TContext;
  /** Information about all steps */
  steps: Record<string, StepInfo>;
  /** Steps currently running */
  runningSteps: string[];
  /** Steps completed successfully */
  completedSteps: string[];
  /** Steps that failed */
  failedSteps: string[];
  /** Steps that were skipped */
  skippedSteps: string[];
  /** Steps pending execution */
  pendingSteps: string[];
}

/**
 * Options for workflow execution
 */
export interface WorkflowOptions<TContext = any> {
  /** Initial context for the workflow */
  initialContext: TContext;
  /** Maximum number of steps to run in parallel */
  maxParallelSteps?: number;
  /** Whether to continue execution if a step fails */
  continueOnFailure?: boolean;
  /** Global timeout for the entire workflow */
  globalTimeout?: number;
  /** Whether to automatically retry failed steps */
  autoRetry?: boolean;
  /** Whether to persist workflow state */
  persist?: boolean;
  /** Storage key for persistence */
  storageKey?: string;
}

/**
 * A reactive workflow engine
 */
export interface ReactiveWorkflow<TContext = any> {
  /** Get the current workflow state */
  state: ReadonlySignal<WorkflowState<TContext>>;
  /** Start the workflow execution */
  start: () => Promise<TContext>;
  /** Pause the workflow execution */
  pause: () => void;
  /** Resume a paused workflow */
  resume: () => void;
  /** Stop the workflow execution */
  stop: () => void;
  /** Retry a failed step */
  retryStep: (stepId: string) => Promise<void>;
  /** Skip a pending step */
  skipStep: (stepId: string) => void;
  /** Jump to a specific step (advanced) */
  jumpToStep: (stepId: string) => Promise<void>;
  /** Update the workflow context */
  updateContext: (updater: (context: TContext) => TContext) => void;
  /** Get a specific step's info */
  getStepInfo: (stepId: string) => ReadonlySignal<StepInfo | undefined>;
  /** Subscribe to step status changes */
  onStepChange: (stepId: string, callback: (info: StepInfo) => void) => () => void;
  /** Subscribe to workflow completion */
  onComplete: (callback: (context: TContext) => void) => () => void;
}

/**
 * Options for creating a workflow
 */
export interface CreateWorkflowOptions<TContext = any> {
  /** Workflow name */
  name: string;
  /** Steps in this workflow */
  steps: WorkflowStep<TContext, any>[];
  /** Initial options */
  options?: Partial<WorkflowOptions<TContext>>;
}

/**
 * Create a reactive workflow
 * 
 * @param config Workflow configuration
 * @returns A reactive workflow object
 */
export function createWorkflow<TContext = any>(
  config: CreateWorkflowOptions<TContext>
): ReactiveWorkflow<TContext> {
  const { name, steps } = config;
  
  // Validate step dependencies
  validateSteps(steps);
  
  // Initialize state
  const initialState: WorkflowState<TContext> = {
    id: `workflow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name,
    isRunning: false,
    isCompleted: false,
    isFailed: false,
    context: {} as TContext,
    steps: steps.reduce((acc, step) => {
      acc[step.id] = {
        id: step.id,
        name: step.name,
        status: 'pending',
        attempts: 0
      };
      return acc;
    }, {} as Record<string, StepInfo>),
    runningSteps: [],
    completedSteps: [],
    failedSteps: [],
    skippedSteps: [],
    pendingSteps: steps.map(step => step.id)
  };
  
  // Create state signal
  const [getState, setState] = createSignalPair<WorkflowState<TContext>>(initialState);
  
  // Step change listeners
  const stepListeners = new Map<string, Set<(info: StepInfo) => void>>();
  
  // Completion listeners
  const completionListeners = new Set<(context: TContext) => void>();
  
  // Workflow options (will be set on start)
  let options: WorkflowOptions<TContext>;
  
  // Step map for quick lookup
  const stepsMap = new Map<string, WorkflowStep<TContext, any>>();
  steps.forEach(step => stepsMap.set(step.id, step));
  
  // Timeout handles
  const timeouts = new Map<string, ReturnType<typeof setTimeout>>();
  
  // Validate steps have valid dependencies
  function validateSteps(steps: WorkflowStep<TContext, any>[]) {
    const stepIds = new Set(steps.map(step => step.id));
    
    for (const step of steps) {
      if (step.dependencies) {
        for (const depId of step.dependencies) {
          if (!stepIds.has(depId)) {
            throw new Error(`Step "${step.id}" has unknown dependency "${depId}"`);
          }
          
          // Check for circular dependencies
          if (hasCircularDependency(step.id, [depId], steps)) {
            throw new Error(`Circular dependency detected: "${step.id}" -> "${depId}"`);
          }
        }
      }
    }
  }
  
  // Check for circular dependencies
  function hasCircularDependency(
    startId: string, 
    path: string[], 
    steps: WorkflowStep<TContext, any>[]
  ): boolean {
    const lastId = path[path.length - 1];
    const step = steps.find(s => s.id === lastId);
    
    if (!step || !step.dependencies || step.dependencies.length === 0) {
      return false;
    }
    
    for (const depId of step.dependencies) {
      if (depId === startId) {
        return true;
      }
      
      if (path.includes(depId)) {
        continue; // Already checked this path
      }
      
      if (hasCircularDependency(startId, [...path, depId], steps)) {
        return true;
      }
    }
    
    return false;
  }
  
  // Start workflow execution
  async function start(): Promise<TContext> {
    // Set default options
    options = {
      initialContext: {} as TContext,
      maxParallelSteps: 1,
      continueOnFailure: false,
      autoRetry: false,
      persist: false,
      ...config.options
    };
    
    // Update state to start workflow
    setState(prev => ({
      ...prev,
      isRunning: true,
      startTime: Date.now(),
      context: options.initialContext
    }));
    
    try {
      // If there's a global timeout, set it up
      if (options.globalTimeout) {
        setTimeout(() => {
          if (getState().isRunning) {
            stop();
            setState(prev => ({
              ...prev,
              isFailed: true,
              endTime: Date.now(),
              duration: prev.startTime ? Date.now() - prev.startTime : undefined
            }));
          }
        }, options.globalTimeout);
      }
      
      // Start executing steps
      await executeNextSteps();
      
      // Get final state
      const finalState = getState();
      
      // Notify completion listeners
      if (finalState.isCompleted) {
        for (const listener of completionListeners) {
          listener(finalState.context);
        }
      }
      
      return finalState.context;
    } catch (error) {
      console.error('Workflow execution error:', error);
      
      // Update state to failed
      setState(prev => ({
        ...prev,
        isRunning: false,
        isFailed: true,
        endTime: Date.now(),
        duration: prev.startTime ? Date.now() - prev.startTime : undefined
      }));
      
      throw error;
    }
  }
  
  // Execute the next batch of steps
  async function executeNextSteps(): Promise<void> {
    const state = getState();
    
    // If workflow is not running, don't execute more steps
    if (!state.isRunning) {
      return;
    }
    
    // Find steps that can be executed (all dependencies completed)
    const executableSteps = state.pendingSteps
      .filter(stepId => {
        const step = stepsMap.get(stepId);
        if (!step) return false;
        
        // Check if dependencies are met
        if (step.dependencies && step.dependencies.length > 0) {
          return step.dependencies.every(depId => 
            state.completedSteps.includes(depId) || state.skippedSteps.includes(depId)
          );
        }
        
        return true;
      })
      .filter(stepId => {
        // Check condition if present
        const step = stepsMap.get(stepId);
        if (!step) return false;
        
        if (step.condition) {
          const shouldRun = step.condition(state.context);
          
          // If condition is false, mark as skipped
          if (!shouldRun) {
            batch(() => {
              setState(prev => ({
                ...prev,
                steps: {
                  ...prev.steps,
                  [stepId]: {
                    ...prev.steps[stepId],
                    status: 'skipped'
                  }
                },
                pendingSteps: prev.pendingSteps.filter(id => id !== stepId),
                skippedSteps: [...prev.skippedSteps, stepId]
              }));
            });
            
            // Notify listeners
            notifyStepListeners(stepId);
            return false;
          }
        }
        
        return true;
      });
    
    // Determine how many steps to run in parallel
    const maxParallel = options.maxParallelSteps || 1;
    const currentlyRunning = state.runningSteps.length;
    const availableSlots = Math.max(0, maxParallel - currentlyRunning);
    
    // Sort by parallel property (non-parallel first)
    const sortedSteps = [...executableSteps].sort((a, b) => {
      const stepA = stepsMap.get(a);
      const stepB = stepsMap.get(b);
      
      // Non-parallel steps come first
      if (stepA?.parallel && !stepB?.parallel) return 1;
      if (!stepA?.parallel && stepB?.parallel) return -1;
      return 0;
    });
    
    // Select steps to run
    const stepsToRun = sortedSteps.slice(0, availableSlots);
    
    // If no steps to run, check if we're done
    if (stepsToRun.length === 0 && currentlyRunning === 0) {
      // Check if we have any pending steps
      if (state.pendingSteps.length === 0) {
        // Workflow completed
        setState(prev => ({
          ...prev,
          isRunning: false,
          isCompleted: true,
          endTime: Date.now(),
          duration: prev.startTime ? Date.now() - prev.startTime : undefined
        }));
      }
      return;
    }
    
    // Update running steps
    if (stepsToRun.length > 0) {
      setState(prev => ({
        ...prev,
        runningSteps: [...prev.runningSteps, ...stepsToRun],
        pendingSteps: prev.pendingSteps.filter(id => !stepsToRun.includes(id))
      }));
    }
    
    // Execute steps
    await Promise.all(stepsToRun.map(executeStep));
    
    // Continue with next batch
    return executeNextSteps();
  }
  
  // Execute a single step
  async function executeStep(stepId: string): Promise<void> {
    const step = stepsMap.get(stepId);
    if (!step) return;
    
    // Update step status to running
    setState(prev => ({
      ...prev,
      steps: {
        ...prev.steps,
        [stepId]: {
          ...prev.steps[stepId],
          status: 'running',
          startTime: Date.now(),
          attempts: prev.steps[stepId].attempts + 1
        }
      }
    }));
    
    // Notify listeners
    notifyStepListeners(stepId);
    
    // Handle step timeout
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (step.timeout) {
      timeoutId = setTimeout(() => {
        handleStepFailure(stepId, new Error(`Step timed out after ${step.timeout}ms`));
      }, step.timeout);
      
      timeouts.set(stepId, timeoutId);
    }
    
    try {
      // Execute the step
      const result = await step.execute(getState().context);
      
      // Clear timeout if set
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeouts.delete(stepId);
      }
      
      // If the workflow was stopped during execution, don't update
      if (!getState().isRunning) return;
      
      // Update context with result
      setState(prev => ({
        ...prev,
        context: {
          ...prev.context,
          [stepId]: result
        },
        steps: {
          ...prev.steps,
          [stepId]: {
            ...prev.steps[stepId],
            status: 'completed',
            endTime: Date.now(),
            duration: prev.steps[stepId].startTime 
              ? Date.now() - prev.steps[stepId].startTime 
              : undefined,
            result
          }
        },
        runningSteps: prev.runningSteps.filter(id => id !== stepId),
        completedSteps: [...prev.completedSteps, stepId]
      }));
      
      // Notify listeners
      notifyStepListeners(stepId);
      
      // Call onSuccess handler if provided
      if (step.onSuccess) {
        step.onSuccess(result, getState().context);
      }
    } catch (error) {
      // Clear timeout if set
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeouts.delete(stepId);
      }
      
      // If the workflow was stopped during execution, don't update
      if (!getState().isRunning) return;
      
      await handleStepFailure(stepId, error);
    }
  }
  
  // Handle a step failure
  async function handleStepFailure(stepId: string, error: any): Promise<void> {
    const step = stepsMap.get(stepId);
    if (!step) return;
    
    const currentState = getState();
    const stepInfo = currentState.steps[stepId];
    
    // Check if we should retry
    const shouldRetry = (options.autoRetry || step.retryAttempts) && 
      stepInfo.attempts < (step.retryAttempts || 1);
    
    if (shouldRetry) {
      // Wait for retry delay if specified
      if (step.retryDelay) {
        await new Promise(resolve => setTimeout(resolve, step.retryDelay));
      }
      
      // Retry the step
      return executeStep(stepId);
    }
    
    // Update step status to failed
    setState(prev => ({
      ...prev,
      steps: {
        ...prev.steps,
        [stepId]: {
          ...prev.steps[stepId],
          status: 'failed',
          endTime: Date.now(),
          duration: prev.steps[stepId].startTime 
            ? Date.now() - prev.steps[stepId].startTime 
            : undefined,
          error
        }
      },
      runningSteps: prev.runningSteps.filter(id => id !== stepId),
      failedSteps: [...prev.failedSteps, stepId]
    }));
    
    // Notify listeners
    notifyStepListeners(stepId);
    
    // Call onError handler if provided
    if (step.onError) {
      step.onError(error, getState().context);
    }
    
    // Check if we should continue
    if (!options.continueOnFailure) {
      // Stop the workflow
      setState(prev => ({
        ...prev,
        isRunning: false,
        isFailed: true,
        endTime: Date.now(),
        duration: prev.startTime ? Date.now() - prev.startTime : undefined
      }));
    }
  }
  
  // Pause workflow execution
  function pause(): void {
    if (!getState().isRunning) return;
    
    setState(prev => ({
      ...prev,
      isRunning: false
    }));
  }
  
  // Resume workflow execution
  function resume(): void {
    const state = getState();
    if (state.isRunning || state.isCompleted || state.isFailed) return;
    
    setState(prev => ({
      ...prev,
      isRunning: true
    }));
    
    // Continue execution
    executeNextSteps();
  }
  
  // Stop workflow execution
  function stop(): void {
    const state = getState();
    if (!state.isRunning) return;
    
    // Clear all timeouts
    for (const timeoutId of timeouts.values()) {
      clearTimeout(timeoutId);
    }
    timeouts.clear();
    
    // Update state
    setState(prev => ({
      ...prev,
      isRunning: false,
      isFailed: true,
      endTime: Date.now(),
      duration: prev.startTime ? Date.now() - prev.startTime : undefined
    }));
  }
  
  // Retry a failed step
  async function retryStep(stepId: string): Promise<void> {
    const state = getState();
    const step = state.steps[stepId];
    
    if (!step || step.status !== 'failed') {
      return;
    }
    
    // Move from failed to pending
    setState(prev => ({
      ...prev,
      steps: {
        ...prev.steps,
        [stepId]: {
          ...prev.steps[stepId],
          status: 'pending',
          error: undefined
        }
      },
      failedSteps: prev.failedSteps.filter(id => id !== stepId),
      pendingSteps: [...prev.pendingSteps, stepId]
    }));
    
    // If the workflow is running, execute the step
    if (state.isRunning) {
      await executeNextSteps();
    }
  }
  
  // Skip a pending step
  function skipStep(stepId: string): void {
    const state = getState();
    const step = state.steps[stepId];
    
    if (!step || step.status !== 'pending') {
      return;
    }
    
    // Mark as skipped
    setState(prev => ({
      ...prev,
      steps: {
        ...prev.steps,
        [stepId]: {
          ...prev.steps[stepId],
          status: 'skipped'
        }
      },
      pendingSteps: prev.pendingSteps.filter(id => id !== stepId),
      skippedSteps: [...prev.skippedSteps, stepId]
    }));
    
    // Notify listeners
    notifyStepListeners(stepId);
    
    // If the workflow is running, execute next steps
    if (state.isRunning) {
      executeNextSteps();
    }
  }
  
  // Jump to a specific step (advanced feature)
  async function jumpToStep(stepId: string): Promise<void> {
    const step = stepsMap.get(stepId);
    if (!step) return;
    
    // Reset all steps
    setState(prev => ({
      ...prev,
      steps: Object.fromEntries(
        Object.entries(prev.steps).map(([id, info]) => {
          if (id === stepId) {
            return [id, { ...info, status: 'pending' }];
          }
          return [id, { ...info, status: 'skipped' }];
        })
      ),
      runningSteps: [],
      completedSteps: [],
      failedSteps: [],
      skippedSteps: Object.keys(prev.steps).filter(id => id !== stepId),
      pendingSteps: [stepId]
    }));
    
    // If the workflow is running, execute the step
    if (getState().isRunning) {
      await executeNextSteps();
    }
  }
  
  // Update workflow context
  function updateContext(updater: (context: TContext) => TContext): void {
    setState(prev => ({
      ...prev,
      context: updater(prev.context)
    }));
  }
  
  // Get a specific step's info as a signal
  function getStepInfo(stepId: string): ReadonlySignal<StepInfo | undefined> {
    // Create a derived signal from the state
    const stepInfo = () => getState().steps[stepId];
    // Cast to the correct type to fix TypeScript error
    return stepInfo as ReadonlySignal<StepInfo | undefined>;
  }
  
  // Subscribe to step status changes
  function onStepChange(
    stepId: string, 
    callback: (info: StepInfo) => void
  ): () => void {
    if (!stepListeners.has(stepId)) {
      stepListeners.set(stepId, new Set());
    }
    
    stepListeners.get(stepId)!.add(callback);
    
    // Return unsubscribe function
    return () => {
      const listeners = stepListeners.get(stepId);
      if (listeners) {
        listeners.delete(callback);
        if (listeners.size === 0) {
          stepListeners.delete(stepId);
        }
      }
    };
  }
  
  // Subscribe to workflow completion
  function onComplete(callback: (context: TContext) => void): () => void {
    completionListeners.add(callback);
    
    // Return unsubscribe function
    return () => {
      completionListeners.delete(callback);
    };
  }
  
  // Notify step listeners of changes
  function notifyStepListeners(stepId: string): void {
    const listeners = stepListeners.get(stepId);
    if (!listeners) return;
    
    const stepInfo = getState().steps[stepId];
    for (const listener of listeners) {
      listener(stepInfo);
    }
  }
  
  // Setup persistence if needed
  if (config.options?.persist && config.options.storageKey && typeof window !== 'undefined') {
    // Load stored state if available
    try {
      const storedState = window.localStorage.getItem(config.options.storageKey);
      if (storedState) {
        const parsedState = JSON.parse(storedState) as WorkflowState<TContext>;
        setState(parsedState);
      }
    } catch (error) {
      console.error('Failed to load workflow state:', error);
    }
    
    // Save state on changes
    createEffect(() => {
      const state = getState();
      try {
        window.localStorage.setItem(
          config.options!.storageKey!, 
          JSON.stringify(state)
        );
      } catch (error) {
        console.error('Failed to save workflow state:', error);
      }
    });
  }
  
  return {
    state: getState,
    start,
    pause,
    resume,
    stop,
    retryStep,
    skipStep,
    jumpToStep,
    updateContext,
    getStepInfo,
    onStepChange,
    onComplete
  };
}

/**
 * Create a simple sequential workflow
 * 
 * @param steps Array of step functions
 * @param options Workflow options
 * @returns A reactive workflow object
 */
export function createSequentialWorkflow<TContext = any>(
  steps: Array<
    (context: TContext) => Promise<any> | any
  >,
  options?: Partial<WorkflowOptions<TContext>>
): ReactiveWorkflow<TContext> {
  // Convert simple functions to workflow steps
  const workflowSteps: WorkflowStep<TContext, any>[] = steps.map((fn, index) => ({
    id: `step_${index}`,
    name: `Step ${index + 1}`,
    execute: fn,
    dependencies: index > 0 ? [`step_${index - 1}`] : undefined
  }));
  
  return createWorkflow({
    name: 'Sequential Workflow',
    steps: workflowSteps,
    options
  });
}

/**
 * Create a parallel workflow
 * 
 * @param steps Array of step functions
 * @param options Workflow options
 * @returns A reactive workflow object
 */
export function createParallelWorkflow<TContext = any>(
  steps: Array<
    (context: TContext) => Promise<any> | any
  >,
  options?: Partial<WorkflowOptions<TContext>>
): ReactiveWorkflow<TContext> {
  // Convert simple functions to workflow steps with parallel = true
  const workflowSteps: WorkflowStep<TContext, any>[] = steps.map((fn, index) => ({
    id: `step_${index}`,
    name: `Step ${index + 1}`,
    execute: fn,
    parallel: true
  }));
  
  return createWorkflow({
    name: 'Parallel Workflow',
    steps: workflowSteps,
    options: {
      maxParallelSteps: steps.length,
      ...options
    }
  });
}

/**
 * Create a conditional branch within a workflow
 */
export function createConditionalSteps<TContext = any>(
  condition: (context: TContext) => boolean,
  thenSteps: WorkflowStep<TContext, any>[],
  elseSteps: WorkflowStep<TContext, any>[] = []
): WorkflowStep<TContext, any>[] {
  // Add conditions to all steps
  const wrappedThenSteps = thenSteps.map(step => ({
    ...step,
    condition: (ctx: TContext) => condition(ctx) && (step.condition ? step.condition(ctx) : true)
  }));
  
  const wrappedElseSteps = elseSteps.map(step => ({
    ...step,
    condition: (ctx: TContext) => !condition(ctx) && (step.condition ? step.condition(ctx) : true)
  }));
  
  return [...wrappedThenSteps, ...wrappedElseSteps];
} 