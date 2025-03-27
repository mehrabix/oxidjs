# Advanced Signal Patterns in oxidjs

This document provides an overview of the advanced reactive signal patterns available in the oxidjs library, extending the core reactivity system with specialized signal types for common use cases.

## Table of Contents

- [Derived Signals](#derived-signals)
- [Filtered Signals](#filtered-signals)
- [Debounced Signals](#debounced-signals)
- [Throttled Signals](#throttled-signals)
- [History Signals](#history-signals)
- [Time-Travel Signals](#time-travel-signals)
- [Signal Families](#signal-families)
- [Resource Signals](#resource-signals)
- [Loadable Signals](#loadable-signals)
- [State Machine Signals](#state-machine-signals)
- [Validated Signals](#validated-signals)

## Derived Signals

Derived signals compute a new value from one or more source signals. They automatically update when any of the source signals change.

```typescript
import { createSignalPair, createDerivedSignal } from 'oxidjs';

const [count, setCount] = createSignalPair(5);
const [multiplier, setMultiplier] = createSignalPair(2);

// Create a derived signal that depends on both count and multiplier
const product = createDerivedSignal(
  [count, multiplier], 
  ([c, m]) => c * m,
  {
    immediate: true, // Compute immediately (default)
    equality: (a, b) => a === b, // Custom equality function
    dispose: true // Auto-dispose subscriptions when no longer needed
  }
);

console.log(product()); // 10

setCount(10);
console.log(product()); // 20

setMultiplier(3);
console.log(product()); // 30
```

## Filtered Signals

Filtered signals only update when a filter condition is met, allowing you to control when a signal's value propagates.

```typescript
import { createSignalPair, createFilteredSignal } from 'oxidjs';

const [count, setCount] = createSignalPair(2);

// Create a filtered signal that only updates for even numbers
const evenOnly = createFilteredSignal(
  count, 
  value => value % 2 === 0,
  { initialPass: false } // Optional: allow initial value to pass regardless of filter
);

console.log(evenOnly()); // 2

setCount(3); // Odd, filtered out
console.log(evenOnly()); // Still 2

setCount(4); // Even, passes filter
console.log(evenOnly()); // 4
```

## Debounced Signals

Debounced signals update only after a specified delay has passed since the last source signal change, useful for handling rapidly changing values.

```typescript
import { createSignalPair, createDebouncedSignal } from 'oxidjs';

const [value, setValue] = createSignalPair('');
const debouncedValue = createDebouncedSignal(value, 500); // 500ms delay

// In a UI scenario:
input.addEventListener('input', (e) => {
  setValue(e.target.value);
});

// debouncedValue() will only update 500ms after the user stops typing
effect(() => {
  console.log('Search query:', debouncedValue());
  // This effect won't run for every keystroke, only after the user pauses
});
```

## Throttled Signals

Throttled signals update at most once per specified time interval, useful for rate-limiting updates while still ensuring regular feedback.

```typescript
import { createSignalPair, createThrottledSignal } from 'oxidjs';

const [position, setPosition] = createSignalPair({ x: 0, y: 0 });
const throttledPosition = createThrottledSignal(position, 100, { trailing: true });

// In a UI scenario:
document.addEventListener('mousemove', (e) => {
  setPosition({ x: e.clientX, y: e.clientY });
});

// throttledPosition() will update at most once every 100ms
effect(() => {
  console.log('Mouse position:', throttledPosition());
  // This runs at most once every 100ms, not for every single mouse movement
});
```

## History Signals

History signals keep track of previous values, allowing you to access a historical record of changes over time.

```typescript
import { createSignalPair, createHistorySignal } from 'oxidjs';

const [value, setValue] = createSignalPair(0);
const history = createHistorySignal(value, 5); // Keep last 5 values

setValue(1);
setValue(2);
setValue(3);

console.log(history()); // 3 (current value)
console.log(history.values()); // [0, 1, 2, 3] (all values)
console.log(history.at(0)); // 0 (first value)
console.log(history.at(-1)); // 3 (latest value)
```

## Time-Travel Signals

Time-travel signals extend history signals with undo and redo capabilities, perfect for implementing features like an editor with history.

```typescript
import { createSignalPair, createTimeTravelSignal } from 'oxidjs';

const [text, setText] = createSignalPair('Hello');
const timeTravel = createTimeTravelSignal(text);

// Make some changes
setText('Hello World');
setText('Hello oxidjs');

console.log(timeTravel()); // "Hello oxidjs"

// Go back in time
timeTravel.undo();
console.log(timeTravel()); // "Hello World"

timeTravel.undo();
console.log(timeTravel()); // "Hello"

// Go forward again
timeTravel.redo();
console.log(timeTravel()); // "Hello World"

// Check if undo/redo is available
console.log(timeTravel.canUndo()); // true
console.log(timeTravel.canRedo()); // true
```

## Signal Families

Signal families manage collections of signals identified by keys, allowing you to dynamically create, access, and manage related signals.

```typescript
import { createSignalFamily } from 'oxidjs';

// Create a family of counter signals with default value 0
const counters = createSignalFamily<number, string>(0);

// Or create a family with a factory function
const userSettings = createSignalFamily<any, string>((key) => {
  // Return default settings based on the key
  if (key === 'theme') return 'light';
  if (key === 'fontSize') return 16;
  return null;
});

// Get or create a signal for a specific key
const counter1 = counters.get('counter1');
const counter2 = counters.get('counter2');

console.log(counter1()); // 0
console.log(counter2()); // 0

// Update a specific counter
counters.set('counter1', 5);
console.log(counter1()); // 5
console.log(counter2()); // Still 0

// Check if a key exists
console.log(counters.has('counter1')); // true
console.log(counters.has('counter3')); // false

// Get all keys
console.log(counters.keys()); // ['counter1', 'counter2']

// Delete a counter
counters.delete('counter2');
console.log(counters.has('counter2')); // false

// Reset the entire family
counters.reset();
console.log(counters.keys()); // []
```

## Resource Signals

Resource signals handle async data fetching with loading and error states, perfect for API calls and remote data.

```typescript
import { createResource } from 'oxidjs';

// Create a resource signal that fetches user data
const user = createResource(
  async () => {
    const response = await fetch('/api/user');
    if (!response.ok) throw new Error('Failed to fetch user');
    return response.json();
  },
  {
    initialData: { name: 'Guest' }, // Optional initial data
    onError: (error) => console.error('Error fetching user:', error),
    cacheTime: 60000, // Cache for 1 minute
    refetchInterval: 300000 // Auto-refetch every 5 minutes
  }
);

// Access the resource
console.log(user()); // Returns current data or initialData if not loaded yet

// Check loading state
console.log(user.loading()); // true during fetch, false when complete

// Check for errors
console.log(user.error()); // undefined or Error object if fetch failed

// Manually trigger a refetch
user.refetch()
  .then(data => console.log('User refetched:', data))
  .catch(error => console.error('Refetch failed:', error));

// Manually update the data (e.g., after a mutation)
user.mutate({ name: 'Updated Name', email: 'new@example.com' });

// Or update with a function
user.mutate(prev => ({ ...prev, lastSeen: new Date() }));
```

## Loadable Signals

Loadable signals provide a more generic approach to handle async operations with loading states.

```typescript
import { createLoadable } from 'oxidjs';

// Create a loadable signal
const [state, run, reset] = createLoadable();

// Run an async operation
async function submitForm(data) {
  const promise = run(
    fetch('/api/submit', {
      method: 'POST',
      body: JSON.stringify(data)
    }).then(res => res.json())
  );
  
  try {
    const result = await promise;
    console.log('Success:', result);
    return result;
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}

// Access the state at any time
effect(() => {
  const { loading, data, error, status } = state();
  
  if (loading) {
    console.log('Submitting...');
  } else if (status === 'success') {
    console.log('Submitted successfully:', data);
  } else if (status === 'error') {
    console.log('Submission failed:', error);
  }
});

// Reset the state (e.g., when closing a form)
function closeForm() {
  reset();
}
```

## State Machine Signals

State machine signals implement the finite state machine pattern, perfect for complex UI states and workflows.

```typescript
import { createStateMachine } from 'oxidjs';

// Define state types
type LoginState = 'idle' | 'authenticating' | 'success' | 'error';
type LoginEvent = 'SUBMIT' | 'SUCCESS' | 'FAILURE' | 'RESET';
interface LoginContext {
  username?: string;
  error?: string;
}

// Create a state machine
const loginMachine = createStateMachine<LoginState, LoginEvent, LoginContext>(
  'idle', // Initial state
  {}, // Initial context
  (state, event, context) => {
    switch (state) {
      case 'idle':
        if (event === 'SUBMIT') {
          return { 
            state: 'authenticating', 
            context: { ...context, username: context.username }
          };
        }
        break;
      case 'authenticating':
        if (event === 'SUCCESS') {
          return { 
            state: 'success', 
            context: { ...context, error: undefined }
          };
        }
        if (event === 'FAILURE') {
          return { 
            state: 'error', 
            context: { ...context, error: 'Invalid credentials' }
          };
        }
        break;
      case 'success':
      case 'error':
        if (event === 'RESET') {
          return { state: 'idle', context: {} };
        }
        break;
    }
    return undefined; // No transition for this state/event combination
  }
);

// Get current state
console.log(loginMachine()); // 'idle'

// Get context
console.log(loginMachine.context()); // {}

// Send events to the machine
function onSubmit(username, password) {
  loginMachine.send('SUBMIT');
  
  // In real code, this would be an async operation
  authenticate(username, password)
    .then(() => loginMachine.send('SUCCESS'))
    .catch(() => loginMachine.send('FAILURE'));
}

// Check if a transition is possible
console.log(loginMachine.canTransition('SUBMIT')); // true
console.log(loginMachine.canTransition('SUCCESS')); // false

// Access state history
console.log(loginMachine.history());
```

## Validated Signals

Validated signals apply validation rules to values before allowing updates, great for form inputs and data validation.

```typescript
import { createValidatedSignal } from 'oxidjs';

// Create validator function
const validateEmail = (email: string) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  if (!email.trim()) {
    return { valid: false, value: email, error: 'Email is required' };
  }
  
  if (!emailRegex.test(email)) {
    return { valid: false, value: email, error: 'Invalid email format' };
  }
  
  return { valid: true, value: email };
};

// Create validated signal
const [emailValidation, setEmail] = createValidatedSignal('', validateEmail);

// In UI code:
function handleEmailChange(e) {
  const result = setEmail(e.target.value);
  
  if (!result.valid) {
    displayError(result.error);
  } else {
    clearError();
  }
}

// Access validation state
effect(() => {
  const { valid, value, error } = emailValidation();
  
  if (valid) {
    console.log('Valid email:', value);
  } else if (error) {
    console.log('Email error:', error);
  }
});
```

## Tips for Using Advanced Signals

1. **Composition**: These patterns can be composed together. For example, you can create a debounced, filtered, derived signal.

2. **Memory Management**: For long-running applications, use the dispose options where available to clean up subscriptions.

3. **Performance**: For expensive computations, consider using `immediate: false` with derived signals and explicitly control when they recompute.

4. **Debugging**: Time-travel and history signals are useful not just for UIs but also for debugging reactivity issues.

5. **API Design**: Use resource signals to create a consistent pattern for all your API calls.

---

These advanced signal patterns extend oxidjs's core reactivity system to handle many common use cases with clean, declarative code. By using these patterns, you can build more robust applications with less boilerplate. 