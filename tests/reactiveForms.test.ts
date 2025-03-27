/**
 * @jest-environment jsdom
 */

import { describe, expect, jest, test, beforeEach } from '@jest/globals';
import {
  createFormField,
  createFormGroup,
  createFieldArray,
  createYupValidator,
  createZodValidator,
  validators
} from '../src/reactiveForms';

// Mock yup
const mockSchema = {
  validate: jest.fn().mockImplementation((value) => Promise.resolve(value)),
  validateSync: jest.fn().mockImplementation((value) => value)
};

jest.mock('yup', () => {
  return {
    object: jest.fn().mockImplementation(() => mockSchema),
    string: jest.fn().mockImplementation(() => ({
      required: jest.fn().mockReturnThis(),
      email: jest.fn().mockReturnThis(),
      min: jest.fn().mockReturnThis(),
      max: jest.fn().mockReturnThis()
    })),
    number: jest.fn().mockImplementation(() => ({
      required: jest.fn().mockReturnThis(),
      min: jest.fn().mockReturnThis(),
      max: jest.fn().mockReturnThis()
    }))
  };
});

// Mock signal module
jest.mock('../src/signal', () => {
  return {
    createSignalPair: jest.fn().mockImplementation((initialValue) => {
      let value = initialValue;
      const getter = jest.fn().mockImplementation(() => value);
      const setter = jest.fn().mockImplementation((newValue) => {
        if (typeof newValue === 'function') {
          value = newValue(value);
        } else {
          value = newValue;
        }
        return value;
      });
      return [getter, setter];
    })
  };
});

// Mock effect module
jest.mock('../src/effect', () => {
  return {
    createEffect: jest.fn().mockImplementation((fn) => {
      fn();
      return jest.fn(); // Return mock cleanup function
    })
  };
});

describe('ReactiveForms', () => {
  describe('FormField', () => {
    test('should create a form field with initial value', () => {
      const field = createFormField('John');
      
      expect(field.value()).toBe('John');
      expect(field.dirty()).toBe(false);
      expect(field.touched()).toBe(false);
      expect(field.valid()).toBe(true);
      expect(field.errors()).toEqual([]);
    });
    
    test('should update field value', () => {
      const field = createFormField('initial');
      
      field.setValue('updated');
      expect(field.value()).toBe('updated');
      expect(field.dirty()).toBe(true);
    });
    
    test('should mark field as touched', () => {
      const field = createFormField('test');
      
      field.markAsTouched();
      expect(field.touched()).toBe(true);
    });
    
    test('should reset field state', () => {
      const field = createFormField('initial');
      
      // Make changes
      field.setValue('changed');
      field.markAsTouched();
      
      // Reset
      field.reset();
      
      expect(field.value()).toBe('initial');
      expect(field.dirty()).toBe(false);
      expect(field.touched()).toBe(false);
    });
    
    test('should apply validators', () => {
      const required = validators.required('Field is required');
      const field = createFormField('', { validators: [required] });
      
      // Empty string should trigger required validator
      expect(field.valid()).toBe(false);
      expect(field.errors()).toEqual(['Field is required']);
      
      // Set valid value
      field.setValue('value');
      expect(field.valid()).toBe(true);
      expect(field.errors()).toEqual([]);
    });
    
    test('should apply multiple validators', () => {
      const required = validators.required('Field is required');
      const minLength = validators.minLength(3, 'Min length is 3');
      
      const field = createFormField('a', { 
        validators: [required, minLength] 
      });
      
      // 'a' fails minLength but passes required
      expect(field.valid()).toBe(false);
      expect(field.errors()).toEqual(['Min length is 3']);
      
      // Empty string fails both validators
      field.setValue('');
      expect(field.valid()).toBe(false);
      expect(field.errors()).toContain('Field is required');
      expect(field.errors()).toContain('Min length is 3');
      
      // Valid value
      field.setValue('abc');
      expect(field.valid()).toBe(true);
      expect(field.errors()).toEqual([]);
    });
  });
  
  describe('FormGroup', () => {
    test('should create a form group with fields', () => {
      const form = createFormGroup({
        name: createFormField('John'),
        email: createFormField('john@example.com')
      });
      
      expect(form.value()).toEqual({
        name: 'John',
        email: 'john@example.com'
      });
      
      expect(form.dirty()).toBe(false);
      expect(form.touched()).toBe(false);
      expect(form.valid()).toBe(true);
    });
    
    test('should update form values', () => {
      const form = createFormGroup({
        name: createFormField(''),
        email: createFormField('')
      });
      
      form.setValue({
        name: 'Jane',
        email: 'jane@example.com'
      });
      
      expect(form.value()).toEqual({
        name: 'Jane',
        email: 'jane@example.com'
      });
      
      expect(form.dirty()).toBe(true);
    });
    
    test('should access individual fields', () => {
      const form = createFormGroup({
        name: createFormField('John'),
        email: createFormField('john@example.com')
      });
      
      expect(form.fields.name.value()).toBe('John');
      expect(form.fields.email.value()).toBe('john@example.com');
      
      // Update field
      form.fields.name.setValue('Jane');
      expect(form.value().name).toBe('Jane');
      
      // Form should be dirty since a field changed
      expect(form.dirty()).toBe(true);
    });
    
    test('should reset form state', () => {
      const form = createFormGroup({
        name: createFormField('John'),
        email: createFormField('john@example.com')
      });
      
      // Make changes
      form.setValue({
        name: 'Jane',
        email: 'jane@example.com'
      });
      
      form.markAsTouched();
      
      // Reset
      form.reset();
      
      expect(form.value()).toEqual({
        name: 'John',
        email: 'john@example.com'
      });
      
      expect(form.dirty()).toBe(false);
      expect(form.touched()).toBe(false);
    });
    
    test('form validity should depend on field validity', () => {
      const form = createFormGroup({
        name: createFormField('', { 
          validators: [validators.required('Name is required')] 
        }),
        email: createFormField('invalid', { 
          validators: [validators.email('Invalid email')] 
        })
      });
      
      // Both fields are invalid
      expect(form.valid()).toBe(false);
      
      // Fix name
      form.fields.name.setValue('John');
      expect(form.valid()).toBe(false); // Still invalid because of email
      
      // Fix email
      form.fields.email.setValue('john@example.com');
      expect(form.valid()).toBe(true); // Now valid
    });
    
    test('should handle nested forms', () => {
      const addressForm = createFormGroup({
        street: createFormField('123 Main St'),
        city: createFormField('Anytown')
      });
      
      const userForm = createFormGroup({
        name: createFormField('John'),
        address: addressForm
      });
      
      expect(userForm.value()).toEqual({
        name: 'John',
        address: {
          street: '123 Main St',
          city: 'Anytown'
        }
      });
      
      // Update nested form
      addressForm.fields.city.setValue('Newtown');
      
      expect(userForm.value().address.city).toBe('Newtown');
      expect(userForm.dirty()).toBe(true);
    });
  });
  
  describe('FieldArray', () => {
    test('should create an array of fields', () => {
      const namesArray = createFieldArray([
        createFormField('John'),
        createFormField('Jane')
      ]);
      
      expect(namesArray.value()).toEqual(['John', 'Jane']);
      expect(namesArray.fields.length).toBe(2);
    });
    
    test('should add fields to array', () => {
      const namesArray = createFieldArray([
        createFormField('John')
      ]);
      
      namesArray.push(createFormField('Jane'));
      
      expect(namesArray.value()).toEqual(['John', 'Jane']);
      expect(namesArray.fields.length).toBe(2);
    });
    
    test('should remove fields from array', () => {
      const namesArray = createFieldArray([
        createFormField('John'),
        createFormField('Jane'),
        createFormField('Bob')
      ]);
      
      namesArray.removeAt(1);
      
      expect(namesArray.value()).toEqual(['John', 'Bob']);
      expect(namesArray.fields.length).toBe(2);
    });
    
    test('should move fields in array', () => {
      const namesArray = createFieldArray([
        createFormField('John'),
        createFormField('Jane'),
        createFormField('Bob')
      ]);
      
      namesArray.move(0, 2);
      
      expect(namesArray.value()).toEqual(['Jane', 'Bob', 'John']);
    });
    
    test('should swap fields in array', () => {
      const namesArray = createFieldArray([
        createFormField('John'),
        createFormField('Jane'),
        createFormField('Bob')
      ]);
      
      namesArray.swap(0, 2);
      
      expect(namesArray.value()).toEqual(['Bob', 'Jane', 'John']);
    });
    
    test('should insert fields at specific position', () => {
      const namesArray = createFieldArray([
        createFormField('John'),
        createFormField('Bob')
      ]);
      
      namesArray.insert(1, createFormField('Jane'));
      
      expect(namesArray.value()).toEqual(['John', 'Jane', 'Bob']);
    });
    
    test('array validity should depend on field validity', () => {
      const required = validators.required('Required');
      
      const namesArray = createFieldArray([
        createFormField('John', { validators: [required] }),
        createFormField('', { validators: [required] }) // Invalid
      ]);
      
      expect(namesArray.valid()).toBe(false);
      
      // Fix invalid field
      namesArray.fields[1].setValue('Jane');
      
      expect(namesArray.valid()).toBe(true);
    });
  });
  
  describe('SchemaValidators', () => {
    test('createYupValidator should create a validator that uses yup', () => {
      // Reset mock
      mockSchema.validate.mockClear();
      mockSchema.validateSync.mockClear();
      
      const yupValidator = createYupValidator(mockSchema);
      
      // Create field with yup validator
      const field = createFormField('test', {
        validators: [yupValidator]
      });
      
      // Should use validateSync
      expect(mockSchema.validateSync).toHaveBeenCalledWith('test');
      expect(field.valid()).toBe(true);
      
      // Mock validation failure
      mockSchema.validateSync.mockImplementationOnce(() => {
        throw new Error('Invalid value');
      });
      
      field.setValue('invalid');
      expect(field.valid()).toBe(false);
    });
    
    test('createZodValidator should create a validator that uses zod', () => {
      // Create mock zod schema
      const zodSchema = {
        safeParse: jest.fn().mockImplementation((value) => ({ 
          success: true, 
          data: value 
        }))
      };
      
      const zodValidator = createZodValidator(zodSchema);
      
      // Create field with zod validator
      const field = createFormField('test', {
        validators: [zodValidator]
      });
      
      expect(zodSchema.safeParse).toHaveBeenCalledWith('test');
      expect(field.valid()).toBe(true);
      
      // Mock validation failure
      zodSchema.safeParse.mockImplementationOnce(() => ({
        success: false,
        error: {
          format: () => [{ message: 'Invalid value' }]
        }
      }));
      
      field.setValue('invalid');
      expect(field.valid()).toBe(false);
    });
  });
  
  describe('Built-in validators', () => {
    test('required validator', () => {
      const validator = validators.required('Required field');
      
      expect(validator('')).toEqual(['Required field']);
      expect(validator(null)).toEqual(['Required field']);
      expect(validator(undefined)).toEqual(['Required field']);
      
      expect(validator('value')).toEqual([]);
      expect(validator(0)).toEqual([]);
      expect(validator(false)).toEqual([]);
    });
    
    test('email validator', () => {
      const validator = validators.email('Invalid email');
      
      expect(validator('not-an-email')).toEqual(['Invalid email']);
      expect(validator('missing@tld')).toEqual(['Invalid email']);
      
      expect(validator('valid@example.com')).toEqual([]);
      expect(validator('user.name+tag@example.co.uk')).toEqual([]);
    });
    
    test('minLength validator', () => {
      const validator = validators.minLength(3, 'Too short');
      
      expect(validator('')).toEqual(['Too short']);
      expect(validator('ab')).toEqual(['Too short']);
      
      expect(validator('abc')).toEqual([]);
      expect(validator('abcd')).toEqual([]);
    });
    
    test('maxLength validator', () => {
      const validator = validators.maxLength(3, 'Too long');
      
      expect(validator('abcd')).toEqual(['Too long']);
      
      expect(validator('')).toEqual([]);
      expect(validator('a')).toEqual([]);
      expect(validator('abc')).toEqual([]);
    });
    
    test('pattern validator', () => {
      const validator = validators.pattern(/^[A-Z]+$/, 'Letters only');
      
      expect(validator('123')).toEqual(['Letters only']);
      expect(validator('abc')).toEqual(['Letters only']);
      expect(validator('Ab')).toEqual(['Letters only']);
      
      expect(validator('A')).toEqual([]);
      expect(validator('ABC')).toEqual([]);
    });
    
    test('min validator', () => {
      const validator = validators.min(5, 'Too small');
      
      expect(validator(4)).toEqual(['Too small']);
      
      expect(validator(5)).toEqual([]);
      expect(validator(6)).toEqual([]);
    });
    
    test('max validator', () => {
      const validator = validators.max(5, 'Too large');
      
      expect(validator(6)).toEqual(['Too large']);
      
      expect(validator(5)).toEqual([]);
      expect(validator(4)).toEqual([]);
    });
  });
}); 