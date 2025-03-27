import { ReadonlySignal, createSignalPair } from './signal';
import { createComputed } from './computed';
import { batch } from './utils';

/**
 * Validation result status
 */
export type ValidationStatus = 'valid' | 'invalid' | 'pending' | 'pristine';

/**
 * Validation result
 */
export interface ValidationResult {
  /** Whether the validation is valid overall */
  valid: boolean;
  /** Current validation status */
  status: ValidationStatus;
  /** Array of error messages if invalid */
  errors: string[];
  /** Whether the field has been touched (interacted with) */
  touched: boolean;
  /** Whether the value has changed from initial */
  dirty: boolean;
  /** Whether validation is currently running */
  validating: boolean;
}

/**
 * A validator function that returns validation errors or undefined if valid
 */
export type Validator<T> = (value: T, context?: any) => string | string[] | undefined | null | Promise<string | string[] | undefined | null>;

/**
 * Options for the validation system
 */
export interface ValidationOptions<T> {
  /** Initial value to validate */
  initialValue?: T;
  /** Auto-validate on value changes */
  validateOnChange?: boolean;
  /** Delay validation after changes (debounce) in ms */
  validationDelay?: number;
  /** Whether to mark as touched initially */
  initiallyTouched?: boolean;
  /** Custom equality function to determine if a value has changed */
  equals?: (a: T, b: T) => boolean;
  /** Whether to run validation on initialization */
  validateOnInit?: boolean;
  /** Context value passed to validators */
  context?: any;
}

/**
 * A reactive validation controller
 */
export interface ValidationController<T> {
  /** The current value being validated */
  value: ReadonlySignal<T>;
  /** Set a new value */
  setValue: (newValue: T) => void;
  /** Reset the value to initial */
  reset: () => void;
  /** Mark the field as touched */
  touch: () => void;
  /** Mark the field as untouched */
  untouch: () => void;
  /** Validate the current value */
  validate: () => Promise<boolean>;
  /** Get the current validation result */
  result: ReadonlySignal<ValidationResult>;
  /** Whether the field is currently valid */
  valid: ReadonlySignal<boolean>;
  /** Current error messages */
  errors: ReadonlySignal<string[]>;
  /** Add a validator dynamically */
  addValidator: (validator: Validator<T>) => () => void;
  /** Remove all validators */
  clearValidators: () => void;
  /** Set the validation context */
  setContext: (context: any) => void;
}

/**
 * Create a reactive validation controller
 * 
 * @param validators Array of validator functions
 * @param options Validation options
 * @returns A validation controller
 */
export function createValidation<T>(
  validators: Validator<T>[] = [],
  options: ValidationOptions<T> = {}
): ValidationController<T> {
  const {
    initialValue = undefined as unknown as T,
    validateOnChange = true,
    validationDelay = 200,
    initiallyTouched = false,
    equals = Object.is,
    validateOnInit = false,
    context = undefined
  } = options;
  
  // Store validators in a set for easy addition/removal
  const validatorSet = new Set(validators);
  
  // Current context value
  let currentContext = context;
  
  // Create signals for state
  const [getValue, setValue] = createSignalPair<T>(initialValue);
  const [getTouched, setTouched] = createSignalPair<boolean>(initiallyTouched);
  const [getDirty, setDirty] = createSignalPair<boolean>(false);
  const [getValidating, setValidating] = createSignalPair<boolean>(false);
  const [getErrors, setErrors] = createSignalPair<string[]>([]);
  
  // Validation timeout id
  let validationTimeout: ReturnType<typeof setTimeout> | null = null;
  
  // Track initial value for dirty checking and reset
  let initialValueRef = initialValue;
  
  // Computed validation result
  const getResult = createComputed(() => {
    const valid = getErrors().length === 0;
    const validating = getValidating();
    const touched = getTouched();
    const dirty = getDirty();
    
    let status: ValidationStatus = 'pristine';
    if (validating) {
      status = 'pending';
    } else if (touched || dirty) {
      status = valid ? 'valid' : 'invalid';
    }
    
    return {
      valid,
      status,
      errors: getErrors(),
      touched,
      dirty,
      validating
    };
  });
  
  // Computed valid state
  const getValid = createComputed(() => getResult().valid);
  
  /**
   * Run all validators against the current value
   */
  async function runValidation(): Promise<boolean> {
    const value = getValue();
    
    // Clear any pending validation
    if (validationTimeout !== null) {
      clearTimeout(validationTimeout);
      validationTimeout = null;
    }
    
    // Skip validation if no validators
    if (validatorSet.size === 0) {
      setErrors([]);
      return true;
    }
    
    // Start validation
    setValidating(true);
    
    try {
      // Run all validators in parallel
      const promises = Array.from(validatorSet).map(validator => 
        Promise.resolve(validator(value, currentContext))
      );
      
      const results = await Promise.all(promises);
      
      // If the value changed during validation, abort
      if (value !== getValue()) {
        return false;
      }
      
      // Collect all errors
      const errors: string[] = [];
      for (const result of results) {
        if (result) {
          if (Array.isArray(result)) {
            errors.push(...result);
          } else {
            errors.push(result);
          }
        }
      }
      
      // Update errors
      setErrors(errors);
      return errors.length === 0;
    } catch (err) {
      console.error('Validation error:', err);
      setErrors(['Validation failed unexpectedly']);
      return false;
    } finally {
      setValidating(false);
    }
  }
  
  /**
   * Schedule validation after the specified delay
   */
  function scheduleValidation(): void {
    // Clear any pending validation
    if (validationTimeout !== null) {
      clearTimeout(validationTimeout);
    }
    
    // Schedule validation
    validationTimeout = setTimeout(() => {
      validationTimeout = null;
      runValidation();
    }, validationDelay);
  }
  
  /**
   * Set a new value with validation
   */
  function updateValue(newValue: T): void {
    const currentValue = getValue();
    
    // If value hasn't changed, do nothing
    if (equals(currentValue, newValue)) {
      return;
    }
    
    // Update dirty state
    const isDirty = !equals(newValue, initialValueRef);
    
    // Batch updates
    batch(() => {
      setValue(newValue);
      setDirty(isDirty);
      
      // Schedule validation if enabled
      if (validateOnChange) {
        scheduleValidation();
      }
    });
  }
  
  /**
   * Reset to initial value
   */
  function reset(): void {
    // Clear any pending validation
    if (validationTimeout !== null) {
      clearTimeout(validationTimeout);
      validationTimeout = null;
    }
    
    // Batch updates
    batch(() => {
      setValue(initialValueRef);
      setDirty(false);
      setTouched(initiallyTouched);
      setErrors([]);
      setValidating(false);
    });
    
    // Validate after reset if needed
    if (validateOnInit) {
      scheduleValidation();
    }
  }
  
  /**
   * Mark as touched with validation
   */
  function touch(): void {
    if (!getTouched()) {
      setTouched(true);
      
      // Validate on touch if enabled
      if (validateOnChange) {
        runValidation();
      }
    }
  }
  
  /**
   * Mark as untouched
   */
  function untouch(): void {
    setTouched(false);
  }
  
  /**
   * Add a validator
   */
  function addValidator(validator: Validator<T>): () => void {
    validatorSet.add(validator);
    
    // Revalidate if we have a value
    if (validateOnChange) {
      scheduleValidation();
    }
    
    // Return function to remove this validator
    return () => {
      validatorSet.delete(validator);
      
      // Revalidate after removing
      if (validateOnChange) {
        scheduleValidation();
      }
    };
  }
  
  /**
   * Clear all validators
   */
  function clearValidators(): void {
    validatorSet.clear();
    setErrors([]);
  }
  
  /**
   * Set validation context
   */
  function setContext(newContext: any): void {
    currentContext = newContext;
    
    // Revalidate with new context
    if (validateOnChange) {
      scheduleValidation();
    }
  }
  
  // Run initial validation if configured
  if (validateOnInit && validatorSet.size > 0) {
    // Run on next tick to ensure everything is set up
    setTimeout(() => {
      runValidation();
    }, 0);
  }
  
  return {
    value: getValue,
    setValue: updateValue,
    reset,
    touch,
    untouch,
    validate: runValidation,
    result: getResult,
    valid: getValid,
    errors: getErrors,
    addValidator,
    clearValidators,
    setContext
  };
}

/**
 * Create a validator that requires a value to be present
 */
export function required(message = 'This field is required'): Validator<any> {
  return (value: any) => {
    if (value === null || value === undefined || value === '') {
      return message;
    }
    if (Array.isArray(value) && value.length === 0) {
      return message;
    }
    if (typeof value === 'object' && Object.keys(value).length === 0) {
      return message;
    }
    
    return null;
  };
}

/**
 * Create a minLength validator
 */
export function minLength(min: number, message?: string): Validator<string | any[]> {
  return (value: string | any[]) => {
    if (value === null || value === undefined) {
      return null; // Let required handle this
    }
    
    const length = value.length;
    if (length < min) {
      return message || `Minimum length is ${min}`;
    }
    
    return null;
  };
}

/**
 * Create a maxLength validator
 */
export function maxLength(max: number, message?: string): Validator<string | any[]> {
  return (value: string | any[]) => {
    if (value === null || value === undefined) {
      return null; // Let required handle this
    }
    
    const length = value.length;
    if (length > max) {
      return message || `Maximum length is ${max}`;
    }
    
    return null;
  };
}

/**
 * Create a pattern validator
 */
export function pattern(regex: RegExp, message = 'Invalid format'): Validator<string> {
  return (value: string) => {
    if (value === null || value === undefined || value === '') {
      return null; // Let required handle this
    }
    
    if (!regex.test(value)) {
      return message;
    }
    
    return null;
  };
}

/**
 * Email validator
 */
export const email = pattern(
  /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
  'Invalid email address'
);

/**
 * Create a min value validator
 */
export function min(minimum: number, message?: string): Validator<number> {
  return (value: number) => {
    if (value === null || value === undefined) {
      return null; // Let required handle this
    }
    
    if (value < minimum) {
      return message || `Minimum value is ${minimum}`;
    }
    
    return null;
  };
}

/**
 * Create a max value validator
 */
export function max(maximum: number, message?: string): Validator<number> {
  return (value: number) => {
    if (value === null || value === undefined) {
      return null; // Let required handle this
    }
    
    if (value > maximum) {
      return message || `Maximum value is ${maximum}`;
    }
    
    return null;
  };
}

/**
 * Create a custom validator
 */
export function createValidator<T>(
  validateFn: (value: T, context?: any) => boolean | Promise<boolean>,
  message: string
): Validator<T> {
  return async (value: T, context?: any) => {
    const result = await validateFn(value, context);
    return result ? null : message;
  };
}

/**
 * Create a validator that must match another value
 */
export function matches<T>(
  getMatchValue: () => T,
  message = 'Values do not match'
): Validator<T> {
  return (value: T) => {
    const matchValue = getMatchValue();
    return Object.is(value, matchValue) ? null : message;
  };
}

/**
 * Create an async validator that waits for the result
 */
export function asyncValidator<T>(
  validateFn: (value: T, context?: any) => Promise<boolean>,
  errorMessage = 'Validation failed'
): Validator<T> {
  return async (value: T, context?: any) => {
    try {
      const result = await validateFn(value, context);
      return result ? null : errorMessage;
    } catch (err) {
      console.error('Async validation error:', err);
      return errorMessage;
    }
  };
}

/**
 * Form validation for multiple fields
 */
export interface FormValidation<T extends Record<string, any>> {
  /** Form controls indexed by field name */
  controls: {
    [K in keyof T]: ValidationController<T[K]>;
  };
  /** Get all form values */
  values: ReadonlySignal<T>;
  /** Overall form validity */
  valid: ReadonlySignal<boolean>;
  /** Whether any field has been touched */
  touched: ReadonlySignal<boolean>;
  /** Whether any field is dirty */
  dirty: ReadonlySignal<boolean>;
  /** Validate all fields */
  validate: () => Promise<boolean>;
  /** Reset all fields */
  reset: () => void;
  /** Mark all fields as touched */
  touchAll: () => void;
  /** Set all form values */
  setValues: (values: Partial<T>) => void;
  /** Get errors by field */
  getFieldErrors: (field: keyof T) => ReadonlySignal<string[]>;
}

/**
 * Create form validation for multiple fields
 */
export function createFormValidation<T extends Record<string, any>>(
  controls: {
    [K in keyof T]: ValidationController<T[K]>;
  }
): FormValidation<T> {
  // Compute overall form validity
  const getValid = createComputed(() => {
    return Object.values(controls).every(
      control => control.valid()
    );
  });
  
  // Compute whether any field has been touched
  const getTouched = createComputed(() => {
    return Object.values(controls).some(
      control => control.result().touched
    );
  });
  
  // Compute whether any field is dirty
  const getDirty = createComputed(() => {
    return Object.values(controls).some(
      control => control.result().dirty
    );
  });
  
  // Compute current form values
  const getValues = createComputed(() => {
    const values = {} as T;
    
    for (const [key, control] of Object.entries(controls)) {
      values[key as keyof T] = control.value();
    }
    
    return values;
  });
  
  /**
   * Validate all fields
   */
  async function validate(): Promise<boolean> {
    const results = await Promise.all(
      Object.values(controls).map(control => control.validate())
    );
    
    return results.every(result => result);
  }
  
  /**
   * Reset all fields
   */
  function reset(): void {
    batch(() => {
      for (const control of Object.values(controls)) {
        control.reset();
      }
    });
  }
  
  /**
   * Mark all fields as touched
   */
  function touchAll(): void {
    batch(() => {
      for (const control of Object.values(controls)) {
        control.touch();
      }
    });
  }
  
  /**
   * Set form values
   */
  function setValues(values: Partial<T>): void {
    batch(() => {
      for (const [key, value] of Object.entries(values)) {
        if (key in controls) {
          controls[key as keyof T].setValue(value);
        }
      }
    });
  }
  
  /**
   * Get errors for a specific field
   */
  function getFieldErrors(field: keyof T): ReadonlySignal<string[]> {
    return controls[field].errors;
  }
  
  return {
    controls,
    values: getValues,
    valid: getValid,
    touched: getTouched,
    dirty: getDirty,
    validate,
    reset,
    touchAll,
    setValues,
    getFieldErrors
  };
} 