import { 
  createValidation, 
  required, 
  minLength, 
  pattern, 
  min,
  max,
  createFormValidation,
  asyncValidator
} from '../src/reactiveValidation';

describe('ReactiveValidation', () => {
  describe('Single field validation', () => {
    it('should validate required fields', async () => {
      const validation = createValidation<string>([required()], {
        initialValue: '',
        validateOnInit: true
      });
      
      // Initially invalid because empty
      expect(validation.valid()).toBe(false);
      expect(validation.errors().length).toBeGreaterThan(0);
      
      // Set a valid value
      validation.setValue('not empty');
      await validation.validate();
      
      expect(validation.valid()).toBe(true);
      expect(validation.errors().length).toBe(0);
    });
    
    it('should validate minimum length', async () => {
      const validation = createValidation<string>(
        [minLength(3, 'Must be at least 3 characters')],
        { initialValue: 'ab' }
      );
      
      // Validate initial value
      await validation.validate();
      
      // Initially invalid because too short
      expect(validation.valid()).toBe(false);
      expect(validation.errors()).toContain('Must be at least 3 characters');
      
      // Set a valid value
      validation.setValue('abc');
      await validation.validate();
      
      expect(validation.valid()).toBe(true);
    });
    
    it('should validate against regex patterns', async () => {
      const validation = createValidation<string>(
        [pattern(/^\d{5}$/, 'Must be a 5-digit ZIP code')],
        { initialValue: 'abc' }
      );
      
      // Validate initial value
      await validation.validate();
      
      // Initially invalid because not a 5-digit number
      expect(validation.valid()).toBe(false);
      
      // Set valid value
      validation.setValue('12345');
      await validation.validate();
      
      expect(validation.valid()).toBe(true);
      
      // Set invalid value
      validation.setValue('1234');
      await validation.validate();
      
      expect(validation.valid()).toBe(false);
    });
    
    it('should track touched and dirty states', () => {
      const validation = createValidation<string>(
        [required()], 
        { initialValue: '' }
      );
      
      // Initially untouched and clean
      expect(validation.result().touched).toBe(false);
      expect(validation.result().dirty).toBe(false);
      
      // Mark as touched
      validation.touch();
      expect(validation.result().touched).toBe(true);
      
      // Should be dirty when value changes
      validation.setValue('new value');
      expect(validation.result().dirty).toBe(true);
      
      // Should reset to untouched and clean
      validation.reset();
      expect(validation.result().touched).toBe(false);
      expect(validation.result().dirty).toBe(false);
    });
    
    it('should handle async validators', async () => {
      // Create an async validator that simulates API check
      const asyncCheck = asyncValidator<string>(
        async (value) => {
          await new Promise(resolve => setTimeout(resolve, 10));
          return value !== 'taken';
        },
        'This value is already taken'
      );
      
      const validation = createValidation<string>(
        [asyncCheck],
        { initialValue: 'available' }
      );
      
      // Initial validation
      expect(validation.result().validating).toBe(false);
      
      // Start validation - should be in validating state
      const validationPromise = validation.validate();
      expect(validation.result().validating).toBe(true);
      
      // Wait for validation to complete
      await validationPromise;
      expect(validation.result().validating).toBe(false);
      expect(validation.valid()).toBe(true);
      
      // Set to an invalid value
      validation.setValue('taken');
      await validation.validate();
      
      expect(validation.valid()).toBe(false);
      expect(validation.errors()).toContain('This value is already taken');
    });
    
    it('should support dynamically adding validators', async () => {
      const validation = createValidation<string>([], { initialValue: '' });
      
      // Initially valid (no validators)
      await validation.validate();
      expect(validation.valid()).toBe(true);
      
      // Add a validator
      const removeValidator = validation.addValidator(required('Field is now required'));
      
      // Now should be invalid
      await validation.validate();
      expect(validation.valid()).toBe(false);
      
      // Remove the validator
      removeValidator();
      
      // Should be valid again
      await validation.validate();
      expect(validation.valid()).toBe(true);
    });
  });
  
  describe('Form validation', () => {
    it('should validate multiple fields together', async () => {
      // Create field validations
      const nameValidation = createValidation<string>([required()], {
        initialValue: ''
      });
      
      const ageValidation = createValidation<number>([min(18, 'Must be an adult')], {
        initialValue: 16
      });
      
      // Create form validation
      const form = createFormValidation({
        name: nameValidation,
        age: ageValidation
      });
      
      // Initially both invalid
      await form.validate();
      expect(form.valid()).toBe(false);
      
      // Fix the name field
      nameValidation.setValue('John');
      await form.validate();
      
      // Still invalid due to age
      expect(form.valid()).toBe(false);
      
      // Fix the age field
      ageValidation.setValue(21);
      await form.validate();
      
      // Now valid
      expect(form.valid()).toBe(true);
    });
    
    it('should provide form-level operations', async () => {
      const nameValidation = createValidation<string>([required()], {
        initialValue: ''
      });
      
      const emailValidation = createValidation<string>([
        required(), 
        pattern(/^\S+@\S+\.\S+$/, 'Invalid email format')
      ], { initialValue: '' });
      
      const form = createFormValidation({
        name: nameValidation,
        email: emailValidation
      });
      
      // Set all values at once
      form.setValues({
        name: 'Jane',
        email: 'jane@example.com'
      });
      
      // Validate all fields
      await form.validate();
      expect(form.valid()).toBe(true);
      
      // Reset all fields
      form.reset();
      await form.validate();
      expect(form.valid()).toBe(false);
      
      // Mark all fields as touched
      form.touchAll();
      expect(nameValidation.result().touched).toBe(true);
      expect(emailValidation.result().touched).toBe(true);
    });
    
    it('should track overall form state', async () => {
      const field1 = createValidation<string>([required()], { initialValue: '' });
      const field2 = createValidation<string>([required()], { initialValue: '' });
      
      const form = createFormValidation({
        field1,
        field2
      });
      
      // Both fields are invalid and untouched
      expect(form.valid()).toBe(false);
      expect(form.touched()).toBe(false);
      
      // Touch one field
      field1.touch();
      expect(form.touched()).toBe(true);
      
      // Set one field to valid
      field1.setValue('value');
      await form.validate();
      
      // Form is still invalid
      expect(form.valid()).toBe(false);
      
      // Set second field to valid
      field2.setValue('value');
      await form.validate();
      
      // Now form is valid
      expect(form.valid()).toBe(true);
    });
    
    it('should access field errors by name', async () => {
      const usernameValidation = createValidation<string>([
        required(),
        minLength(3, 'Username too short')
      ], { initialValue: 'a' });
      
      const form = createFormValidation({
        username: usernameValidation
      });
      
      // Validate
      await form.validate();
      
      // Get field errors
      const errors = form.getFieldErrors('username');
      expect(errors().length).toBeGreaterThan(0);
      expect(errors()).toContain('Username too short');
    });
  });
}); 