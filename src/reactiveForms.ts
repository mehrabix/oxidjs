import { ReadonlySignal, createSignalPair } from './signal';
import { createEffect } from './effect';
import { batch } from './utils';

/**
 * Represents the state of a form field
 */
export interface FormFieldState<T> {
  /** The current value of the field */
  value: T;
  /** Whether the field is currently focused */
  focused: boolean;
  /** Whether the field has been touched (visited and blurred) */
  touched: boolean;
  /** Whether the field has been visited */
  visited: boolean;
  /** Whether the field is dirty (value has changed) */
  dirty: boolean;
  /** Whether the field has validation errors */
  hasError: boolean;
  /** Validation errors for the field */
  errors: string[];
  /** Whether the field is currently being validated */
  validating: boolean;
}

/**
 * A field validator function
 */
export type FieldValidator<T> = (value: T) => string | string[] | null | undefined;

/**
 * A form field
 */
export interface FormField<T> {
  /** Read the form field value */
  (): FormFieldState<T>;
  /** Read the field value */
  value: ReadonlySignal<T>;
  /** Set the field value */
  setValue: (value: T) => void;
  /** Mark field as touched */
  markTouched: () => void;
  /** Mark field as untouched */
  markUntouched: () => void;
  /** Mark field as pristine */
  markPristine: () => void;
  /** Mark field as dirty */
  markDirty: () => void;
  /** Whether the field value is valid */
  valid: ReadonlySignal<boolean>;
  /** Get current field errors */
  errors: ReadonlySignal<string[]>;
  /** Disable the field */
  disable: () => void;
  /** Enable the field */
  enable: () => void;
  /** Reset field to initial value */
  reset: () => void;
  /** Add a validator */
  addValidator: (validator: FieldValidator<T>) => void;
  /** Remove all validators */
  clearValidators: () => void;
  /** Check validity and update errors */
  updateValidation: () => Promise<boolean>;
  /** Mark the field as touched */
  markFocused?: (focused?: boolean) => void;
  /** Mark the field as visited */
  markVisited?: (visited?: boolean) => void;
  /** Run validation on the field */
  validate?: () => Promise<boolean>;
  /** Whether the field has errors */
  hasError?: ReadonlySignal<boolean>;
  /** Whether the field is touched */
  touched?: ReadonlySignal<boolean>;
  /** Whether the field is dirty */
  dirty?: ReadonlySignal<boolean>;
  /** Whether the field is being validated */
  validating?: ReadonlySignal<boolean>;
  /** Get input props for binding to DOM elements */
  getInputProps?: () => {
    value: T;
    onFocus: () => void;
    onBlur: () => void;
    onChange: (value: T) => void;
  };
}

/**
 * Options for creating a form field
 */
export interface FormFieldOptions<T> {
  /** Initial value of the field */
  initialValue: T;
  /** Validation function(s) for the field */
  validators?: Array<(value: T) => string | null | Promise<string | null>>;
  /** Whether to validate on change */
  validateOnChange?: boolean;
  /** Whether to validate on blur */
  validateOnBlur?: boolean;
}

/**
 * Create a reactive form field with validation capabilities
 * 
 * @param options Configuration options
 * @returns A form field object
 */
export function createFormField<T>(
  options: FormFieldOptions<T>
): FormField<T> {
  const {
    initialValue,
    validators = [],
    validateOnChange = true,
    validateOnBlur = true
  } = options;
  
  // Initial state
  const initialState: FormFieldState<T> = {
    value: initialValue,
    focused: false,
    touched: false,
    visited: false,
    dirty: false,
    hasError: false,
    errors: [],
    validating: false
  };
  
  // Create state signal
  const [state, setState] = createSignalPair<FormFieldState<T>>(initialState);
  
  // Create signals for derived states
  const [value, setValue] = createSignalPair<T>(initialValue);
  const [focused, setFocused] = createSignalPair(false);
  const [touched, setTouched] = createSignalPair(false);
  const [visited, setVisited] = createSignalPair(false);
  const [dirty, setDirty] = createSignalPair(false);
  const [hasError, setHasError] = createSignalPair(false);
  const [errors, setErrors] = createSignalPair<string[]>([]);
  const [validating, setValidating] = createSignalPair(false);
  
  // Keep derived signals in sync with the state
  createEffect(() => {
    const current = state();
    
    if (value() !== current.value) {
      setValue(current.value);
    }
    
    if (focused() !== current.focused) {
      setFocused(current.focused);
    }
    
    if (touched() !== current.touched) {
      setTouched(current.touched);
    }
    
    if (visited() !== current.visited) {
      setVisited(current.visited);
    }
    
    if (dirty() !== current.dirty) {
      setDirty(current.dirty);
    }
    
    if (hasError() !== current.hasError) {
      setHasError(current.hasError);
    }
    
    if (errors() !== current.errors) {
      setErrors(current.errors);
    }
    
    if (validating() !== current.validating) {
      setValidating(current.validating);
    }
  });
  
  // Set value and mark as dirty
  const setFieldValue = (newValue: T | ((prev: T) => T)): void => {
    setState(prev => {
      const updatedValue = typeof newValue === 'function'
        ? (newValue as Function)(prev.value)
        : newValue as T;
      
      return {
        ...prev,
        value: updatedValue,
        dirty: updatedValue !== initialValue
      };
    });
    
    // Run validation if needed
    if (validateOnChange) {
      runValidation();
    }
  };
  
  // Mark field as focused
  const markFocused = (isFocused = true): void => {
    setState(prev => ({
      ...prev,
      focused: isFocused,
      visited: prev.visited || isFocused
    }));
  };
  
  // Mark field as touched (normally on blur)
  const markTouched = (isTouched = true): void => {
    setState(prev => ({
      ...prev,
      touched: isTouched
    }));
    
    // Run validation if needed
    if (validateOnBlur && isTouched) {
      runValidation();
    }
  };
  
  // Mark field as visited
  const markVisited = (isVisited = true): void => {
    setState(prev => ({
      ...prev,
      visited: isVisited
    }));
  };
  
  // Run all validators
  const runValidation = async (): Promise<boolean> => {
    if (validators.length === 0) {
      // No validators, always valid
      setState(prev => ({
        ...prev,
        hasError: false,
        errors: []
      }));
      return true;
    }
    
    // Start validation
    setState(prev => ({
      ...prev,
      validating: true
    }));
    
    try {
      // Run all validators
      const fieldValue = state().value;
      const validationResults = await Promise.all(
        validators.map(validator => validator(fieldValue))
      );
      
      // Filter out null/undefined results
      const fieldErrors = validationResults
        .filter((result): result is string => result !== null && result !== undefined);
      
      // Update state
      setState(prev => ({
        ...prev,
        hasError: fieldErrors.length > 0,
        errors: fieldErrors,
        validating: false
      }));
      
      return fieldErrors.length === 0;
    } catch (error) {
      // Handle validation errors
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      setState(prev => ({
        ...prev,
        hasError: true,
        errors: [errorMessage],
        validating: false
      }));
      
      return false;
    }
  };
  
  // Reset field to initial state
  const reset = (): void => {
    setState(initialState);
  };
  
  // Get input binding props
  const getInputProps = () => {
    return {
      value: state().value,
      onFocus: () => markFocused(true),
      onBlur: () => {
        markFocused(false);
        markTouched(true);
      },
      onChange: (value: T) => setFieldValue(value)
    };
  };
  
  // Create the form field object
  const formField = (() => state()) as FormField<T>;
  
  // Add properties and methods
  formField.value = value;
  formField.setValue = setFieldValue;
  formField.errors = errors;
  formField.hasError = hasError;
  formField.touched = touched;
  formField.dirty = dirty;
  formField.validating = validating;
  formField.markTouched = markTouched;
  formField.markFocused = markFocused;
  formField.markVisited = markVisited;
  formField.validate = runValidation;
  formField.reset = reset;
  formField.getInputProps = getInputProps;
  
  return formField;
}

/**
 * Represents the state of a form
 */
export interface FormState<T extends Record<string, any>> {
  /** All field values as a record */
  values: T;
  /** Whether the form is valid */
  isValid: boolean;
  /** Whether the form has been touched */
  isTouched: boolean;
  /** Whether the form is dirty (any values changed) */
  isDirty: boolean;
  /** Whether the form is currently being validated */
  isValidating: boolean;
  /** Whether the form is currently being submitted */
  isSubmitting: boolean;
  /** Whether the form has been submitted */
  isSubmitted: boolean;
  /** All errors in the form */
  errors: Record<keyof T, string[]>;
}

/**
 * Options for form submission
 */
export interface FormSubmitOptions {
  /** Whether to validate the form before submission */
  validateBeforeSubmit?: boolean;
}

/**
 * A reactive form with validation and submission handling
 */
export interface Form<T extends Record<string, any>> extends ReadonlySignal<FormState<T>> {
  /** Get all form values */
  values: ReadonlySignal<T>;
  /** Whether the form is valid */
  isValid: ReadonlySignal<boolean>;
  /** Whether the form is touched */
  isTouched: ReadonlySignal<boolean>;
  /** Whether the form is dirty */
  isDirty: ReadonlySignal<boolean>;
  /** Whether the form is being validated */
  isValidating: ReadonlySignal<boolean>;
  /** Whether the form is being submitted */
  isSubmitting: ReadonlySignal<boolean>;
  /** Get a specific field */
  field: <K extends keyof T>(name: K) => FormField<T[K]>;
  /** Register a field with the form */
  registerField: <K extends keyof T>(name: K, options: FormFieldOptions<T[K]>) => FormField<T[K]>;
  /** Unregister a field from the form */
  unregisterField: (name: keyof T) => void;
  /** Set a specific field value */
  setFieldValue: <K extends keyof T>(name: K, value: T[K] | ((prev: T[K]) => T[K])) => void;
  /** Set multiple field values at once */
  setValues: (values: Partial<T> | ((prev: T) => Partial<T>)) => void;
  /** Validate all fields */
  validate: () => Promise<boolean>;
  /** Reset the form to its initial state */
  reset: () => void;
  /** Handle form submission */
  handleSubmit: (
    onSubmit: (values: T) => void | Promise<void>,
    options?: FormSubmitOptions
  ) => (e?: Event) => Promise<void>;
}

/**
 * Options for creating a form
 */
export interface FormOptions<T extends Record<string, any>> {
  /** Initial values for the form */
  initialValues: T;
  /** Form-level validation function */
  validate?: (values: T) => Record<keyof T, string[]> | Promise<Record<keyof T, string[]>>;
  /** Callback when values change */
  onValuesChange?: (values: T) => void;
}

/**
 * Create a reactive form
 * 
 * @param options Configuration options
 * @returns A form object
 */
export function createForm<T extends Record<string, any>>(
  options: FormOptions<T>
): Form<T> {
  const {
    initialValues,
    validate,
    onValuesChange
  } = options;
  
  // Initial state
  const initialState: FormState<T> = {
    values: { ...initialValues },
    isValid: true,
    isTouched: false,
    isDirty: false,
    isValidating: false,
    isSubmitting: false,
    isSubmitted: false,
    errors: Object.keys(initialValues).reduce((acc, key) => {
      acc[key as keyof T] = [];
      return acc;
    }, {} as Record<keyof T, string[]>)
  };
  
  // Create state signal
  const [state, setState] = createSignalPair<FormState<T>>(initialState);
  
  // Create derived signals
  const [values, setValues] = createSignalPair<T>({ ...initialValues });
  const [isValid, setIsValid] = createSignalPair(true);
  const [isTouched, setIsTouched] = createSignalPair(false);
  const [isDirty, setIsDirty] = createSignalPair(false);
  const [isValidating, setIsValidating] = createSignalPair(false);
  const [isSubmitting, setIsSubmitting] = createSignalPair(false);
  
  // Keep derived signals in sync
  createEffect(() => {
    const current = state();
    
    if (values() !== current.values) {
      setValues(current.values);
    }
    
    if (isValid() !== current.isValid) {
      setIsValid(current.isValid);
    }
    
    if (isTouched() !== current.isTouched) {
      setIsTouched(current.isTouched);
    }
    
    if (isDirty() !== current.isDirty) {
      setIsDirty(current.isDirty);
    }
    
    if (isValidating() !== current.isValidating) {
      setIsValidating(current.isValidating);
    }
    
    if (isSubmitting() !== current.isSubmitting) {
      setIsSubmitting(current.isSubmitting);
    }
    
    // Call onValuesChange when values change
    if (onValuesChange) {
      onValuesChange(current.values);
    }
  });
  
  // Store for form fields
  const fields = new Map<keyof T, FormField<any>>();
  
  // Register a field with the form
  const registerField = <K extends keyof T>(
    name: K,
    fieldOptions: FormFieldOptions<T[K]>
  ): FormField<T[K]> => {
    // Create the field
    const field = createFormField<T[K]>({
      ...fieldOptions,
      initialValue: fieldOptions.initialValue !== undefined
        ? fieldOptions.initialValue
        : initialValues[name]
    });
    
    // Store the field
    fields.set(name, field);
    
    // Subscribe to field changes
    createEffect(() => {
      const fieldState = field();
      
      // Update form values when field value changes
      setState(prev => ({
        ...prev,
        values: {
          ...prev.values,
          [name]: fieldState.value
        },
        isTouched: prev.isTouched || fieldState.touched,
        isDirty: prev.isDirty || fieldState.dirty,
        isValidating: prev.isValidating || fieldState.validating,
        errors: {
          ...prev.errors,
          [name]: fieldState.errors
        }
      }));
      
      // Update form validity
      updateFormValidity();
    });
    
    return field;
  };
  
  // Unregister a field
  const unregisterField = (name: keyof T): void => {
    fields.delete(name);
    
    // Update values and errors without the field
    setState(prev => {
      const newValues = { ...prev.values };
      const newErrors = { ...prev.errors };
      
      delete newValues[name];
      delete newErrors[name];
      
      return {
        ...prev,
        values: newValues as T,
        errors: newErrors as Record<keyof T, string[]>
      };
    });
    
    // Update form validity
    updateFormValidity();
  };
  
  // Update form validity based on fields
  const updateFormValidity = (): void => {
    let formValid = true;
    
    // Check if any field has an error
    for (const [, field] of fields) {
      if (field().hasError) {
        formValid = false;
        break;
      }
    }
    
    // Update form validity
    setState(prev => ({
      ...prev,
      isValid: formValid
    }));
  };
  
  // Set a field value
  const setFieldValue = <K extends keyof T>(
    name: K,
    value: T[K] | ((prev: T[K]) => T[K])
  ): void => {
    // Get the field
    const field = fields.get(name);
    
    if (field) {
      // Update field value
      field.setValue(value as any);
    } else {
      // Field not registered, update form state directly
      setState(prev => {
        const newValue = typeof value === 'function'
          ? (value as Function)(prev.values[name])
          : value;
        
        return {
          ...prev,
          values: {
            ...prev.values,
            [name]: newValue
          },
          isDirty: true
        };
      });
    }
  };
  
  // Set multiple values at once
  const setMultipleValues = (
    newValues: Partial<T> | ((prev: T) => Partial<T>)
  ): void => {
    // Calculate the new values
    const valuesToSet = typeof newValues === 'function'
      ? (newValues as Function)(state().values)
      : newValues;
    
    // Update registered fields
    batch(() => {
      for (const [name, value] of Object.entries(valuesToSet)) {
        setFieldValue(name as keyof T, value as any);
      }
    });
  };
  
  // Get a field by name
  const getField = <K extends keyof T>(name: K): FormField<T[K]> => {
    const field = fields.get(name);
    
    if (!field) {
      throw new Error(`Field "${String(name)}" is not registered with the form`);
    }
    
    return field as FormField<T[K]>;
  };
  
  // Validate all fields and the form itself
  const validateForm = async (): Promise<boolean> => {
    try {
      // Set validating state
      setIsValidating(true);
      
      // Validate all fields
      const fieldValidations = Array.from(fields.entries()).map(
        ([name, field]) => field.validate ? field.validate().then(isValid => ({ name, isValid })) 
                                          : Promise.resolve({ name, isValid: true })
      );
      
      const fieldResults = await Promise.all(fieldValidations);
      
      // Check if all fields are valid
      const allFieldsValid = fieldResults.every(result => result.isValid);
      
      // Update form validity
      setIsValid(allFieldsValid);
      
      // Validate with form level validator
      if (allFieldsValid && validate) {
        // ... existing code ...
      }
      
      return allFieldsValid;
    } catch (error) {
      // Handle validation error
      setIsValid(false);
      setIsValidating(false);
      
      return false;
    }
  };
  
  // Reset the form to initial values
  const resetForm = (): void => {
    // Reset all fields
    for (const [, field] of fields) {
      field.reset();
    }
    
    // Reset form state
    setState(initialState);
  };
  
  // Handle form submission
  const handleSubmit = (
    onSubmit: (values: T) => void | Promise<void>,
    options: FormSubmitOptions = {}
  ) => {
    const { validateBeforeSubmit = true } = options;
    
    return async (e?: Event): Promise<void> => {
      // Prevent default form submission if event is provided
      if (e && e.preventDefault) {
        e.preventDefault();
      }
      
      // Set form as submitted
      setState(prev => ({
        ...prev,
        isSubmitted: true
      }));
      
      // Validate if needed
      let isValid = true;
      if (validateBeforeSubmit) {
        isValid = await validateForm();
      }
      
      if (!isValid) {
        return;
      }
      
      // Start submission
      setState(prev => ({
        ...prev,
        isSubmitting: true
      }));
      
      try {
        // Call submit handler
        await onSubmit(state().values);
        
        // Success
        setState(prev => ({
          ...prev,
          isSubmitting: false
        }));
      } catch (error) {
        // Submission failed
        setState(prev => ({
          ...prev,
          isSubmitting: false
        }));
        
        // Re-throw the error
        throw error;
      }
    };
  };
  
  // Create the form object
  const form = (() => state()) as Form<T>;
  
  // Add properties and methods
  form.values = values;
  form.isValid = isValid;
  form.isTouched = isTouched;
  form.isDirty = isDirty;
  form.isValidating = isValidating;
  form.isSubmitting = isSubmitting;
  form.field = getField;
  form.registerField = registerField;
  form.unregisterField = unregisterField;
  form.setFieldValue = setFieldValue;
  form.setValues = setMultipleValues;
  form.validate = validateForm;
  form.reset = resetForm;
  form.handleSubmit = handleSubmit;
  
  return form;
}

/**
 * Create a validator that requires a value to be present
 * 
 * @param message Custom error message
 * @returns Validator function
 */
export function required(message = 'This field is required'): <T>(value: T) => string | null {
  return <T>(value: T): string | null => {
    if (value === undefined || value === null || value === '') {
      return message;
    }
    
    if (Array.isArray(value) && value.length === 0) {
      return message;
    }
    
    return null;
  };
}

/**
 * Create a validator for minimum string length
 * 
 * @param min Minimum length
 * @param message Custom error message
 * @returns Validator function
 */
export function minLength(min: number, message?: string): (value: string) => string | null {
  return (value: string): string | null => {
    if (!value || value.length < min) {
      return message || `Must be at least ${min} characters`;
    }
    return null;
  };
}

/**
 * Create a validator for maximum string length
 * 
 * @param max Maximum length
 * @param message Custom error message
 * @returns Validator function
 */
export function maxLength(max: number, message?: string): (value: string) => string | null {
  return (value: string): string | null => {
    if (value && value.length > max) {
      return message || `Must be at most ${max} characters`;
    }
    return null;
  };
}

/**
 * Create a validator for email format
 * 
 * @param message Custom error message
 * @returns Validator function
 */
export function email(message = 'Invalid email address'): (value: string) => string | null {
  return (value: string): string | null => {
    if (!value) return null;
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      return message;
    }
    
    return null;
  };
}

/**
 * Create a validator based on a regular expression
 * 
 * @param pattern Regular expression pattern
 * @param message Custom error message
 * @returns Validator function
 */
export function pattern(pattern: RegExp, message = 'Invalid format'): (value: string) => string | null {
  return (value: string): string | null => {
    if (!value) return null;
    
    if (!pattern.test(value)) {
      return message;
    }
    
    return null;
  };
}

/**
 * Create a validator for a number range
 * 
 * @param min Minimum value
 * @param max Maximum value
 * @param message Custom error message
 * @returns Validator function
 */
export function range(min: number, max: number, message?: string): (value: number) => string | null {
  return (value: number): string | null => {
    if (value === undefined || value === null) return null;
    
    if (value < min || value > max) {
      return message || `Must be between ${min} and ${max}`;
    }
    
    return null;
  };
}

/**
 * Compose multiple validators into a single validator
 * 
 * @param validators Array of validators to compose
 * @returns A composed validator function
 */
export function composeValidators<T>(...validators: Array<(value: T) => string | null>): (value: T) => string | null {
  return (value: T): string | null => {
    for (const validator of validators) {
      const error = validator(value);
      if (error) {
        return error;
      }
    }
    return null;
  };
} 