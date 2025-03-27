/**
 * oxidjs: A lightweight reactive library inspired by SolidJS, Angular, and Vue
 */

// Main exports file
export * from './signal';
export * from './effect';
export * from './computed';

// Imported from external files, not from local modules
// export * from './store';
export * from './utils';

// Advanced signals
export * from './derivedSignal';
export * from './linkedSignal';
export * from './statefulSignal';
export * from './provideInject';

// These modules don't exist yet
// export * from './asyncState';
// export * from './asyncSignal';

// Reactive patterns
export * from './reactiveQuery';
export * from './reactiveContext';
export * from './reactiveForms';
export * from './reactiveActions';
export * from './reactiveStorage';
export * from './reactiveMediator';
export * from './reactiveWorkflow';

// Handle re-export conflicts
// Export values
export { 
  createValidation,
  // Re-export these carefully to avoid conflicts
  // with reactive forms exports
  required as validationRequired,
  minLength as validationMinLength,
  maxLength as validationMaxLength,
  pattern as validationPattern,
  email as validationEmail,
  min,
  max,
  createValidator,
  matches,
  asyncValidator,
  createFormValidation
} from './reactiveValidation';

// Export types
export type {
  ValidationController,
  ValidationOptions,
  ValidationStatus,
  Validator
} from './reactiveValidation';

export * from './reactiveInspector';
export * from './reactiveCache';
export * from './reactiveVirtualList';

// This module doesn't exist yet
// export * from './reactiveSync';

export * from './reactiveHistory';
export * from './reactiveSubscription';
export * from './reactiveRouter';

// Version
export const VERSION = '1.0.0'; 