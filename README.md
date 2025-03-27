# oxidjs

A lightweight, efficient reactivity library for JavaScript, inspired by SolidJS, Angular, and Vue. Built with TypeScript for use in any JavaScript environment.

## Features

- **Signals**: Fine-grained reactivity with minimal overhead
- **Computed Values**: Automatically derived and cached reactive values
- **Effects**: Run side effects when reactive dependencies change
- **Reactive Objects**: Make plain JavaScript objects reactive
- **Watchers**: Observe changes to reactive values
- **Batching**: Group reactive updates for better performance
- **Advanced Signal Patterns**:
  - Derived, Filtered, Debounced & Throttled Signals
  - Resource Signals for async data handling
  - History & Time-Travel Signals
  - Signal Families
  - And more!
- **Reactive Context**: Hierarchical reactive context system
- **Reactive Store**: Global state management solution
- **Reactive Query**: Data fetching with caching & automatic refresh
- **Reactive Forms**: Form state management with validation
- **TypeScript Support**: Full type safety and great developer experience

## Installation

```bash
# Using npm
npm install oxidjs

# Using yarn
yarn add oxidjs

# Using pnpm
pnpm add oxidjs
```

## Basic Usage

```typescript
import { createSignal, createEffect } from 'oxidjs';

// Create a signal with an initial value
const [count, setCount] = createSignalPair(0);

// Create an effect that runs whenever count changes
createEffect(() => {
  console.log(`Count is now: ${count()}`);
});

// Update the signal, which triggers the effect
setCount(1); // Logs: "Count is now: 1"
setCount(2); // Logs: "Count is now: 2"

// You can also pass a function to update based on previous value
setCount(prev => prev + 1); // Logs: "Count is now: 3"
```

## Computed Values

```typescript
import { createSignalPair, createComputed } from 'oxidjs';

// Create signals
const [firstName, setFirstName] = createSignalPair('John');
const [lastName, setLastName] = createSignalPair('Doe');

// Create a computed value that depends on the signals
const fullName = createComputed(() => `${firstName()} ${lastName()}`);

console.log(fullName()); // "John Doe"

// When a dependency changes, the computed value updates
setFirstName('Jane');
console.log(fullName()); // "Jane Doe"
```

## Reactive Objects

```typescript
import { reactive, watch } from 'oxidjs';

// Create a reactive object
const user = reactive({
  name: 'Alice',
  age: 30,
  address: {
    city: 'New York',
    zipCode: '10001'
  }
});

// Watch for changes
watch(() => user.name, (newValue, oldValue) => {
  console.log(`Name changed from ${oldValue} to ${newValue}`);
});

// Update the property
user.name = 'Bob'; // Logs: "Name changed from Alice to Bob"

// Nested properties are also reactive
user.address.city = 'Los Angeles';
```

## Signal API

The Signal API is the core of oxidjs:

```typescript
// Creating signals
const signal = createSignal(initialValue);
const [getValue, setValue] = createSignalPair(initialValue);

// Reading a signal's value
const value = signal();
// or
const value = signal.value;

// Writing a signal's value
signal(newValue);
// or
signal.value = newValue;

// Reading without tracking (doesn't create dependencies)
const value = signal.peek();

// Manual subscription
const unsubscribe = signal.subscribe((newValue, oldValue) => {
  console.log(`Value changed from ${oldValue} to ${newValue}`);
});

// Unsubscribe when done
unsubscribe();
```

## Effects System

Effects run automatically when their dependencies change:

```typescript
import { createSignal, createEffect, untrack } from 'oxidjs';

const [count, setCount] = createSignalPair(0);

// Basic effect
createEffect(() => {
  console.log(`Count: ${count()}`);
});

// With cleanup
createEffect(() => {
  const interval = setInterval(() => {
    console.log(`Count is ${count()}`);
  }, 1000);
  
  // Return cleanup function
  return () => clearInterval(interval);
});

// Run code without tracking dependencies
createEffect(() => {
  // This creates a dependency
  const currentCount = count();
  
  // This does not create a dependency
  untrack(() => {
    fetch(`/api/data?count=${currentCount}`);
  });
});
```

## Batching Updates

Group multiple updates to avoid unnecessary re-computations:

```typescript
import { createSignalPair, createEffect, batch } from 'oxidjs';

const [firstName, setFirstName] = createSignalPair('John');
const [lastName, setLastName] = createSignalPair('Doe');

createEffect(() => {
  console.log(`Name: ${firstName()} ${lastName()}`);
});

// Without batching, the effect would run twice
batch(() => {
  setFirstName('Jane');
  setLastName('Smith');
}); 
// Effect only runs once with both updates
// Logs: "Name: Jane Smith"
```

## Advanced Signal Patterns

### Derived Signals

```typescript
import { createSignalPair, createDerivedSignal } from 'oxidjs';

const [celsius, setCelsius] = createSignalPair(25);

// Create a derived signal that updates when celsius changes
const fahrenheit = createDerivedSignal(
  [celsius],
  ([c]) => c * 9/5 + 32,
);

console.log(fahrenheit()); // 77

setCelsius(30);
console.log(fahrenheit()); // 86
```

### Filtered Signals

```typescript
import { createSignalPair, createFilteredSignal } from 'oxidjs';

const [count, setCount] = createSignalPair(0);

// Only update when the value is even
const evenCount = createFilteredSignal(
  count,
  value => value % 2 === 0
);

console.log(evenCount()); // 0

setCount(1);
console.log(evenCount()); // 0 (still, because 1 is not even)

setCount(2);
console.log(evenCount()); // 2
```

### Debounced and Throttled Signals

```typescript
import { createSignalPair, createDebouncedSignal, createThrottledSignal } from 'oxidjs';

const [searchTerm, setSearchTerm] = createSignalPair('');

// Debounced signal waits for 300ms of inactivity before updating
const debouncedSearch = createDebouncedSignal(searchTerm, 300);

// Throttled signal updates at most once every 500ms
const throttledCounter = createThrottledSignal(searchTerm, 500);

// Effects using debounced/throttled signals won't run too frequently
createEffect(() => {
  console.log(`Searching for: ${debouncedSearch()}`);
});
```

### History and Time Travel

```typescript
import { createSignalPair, createHistorySignal, createTimeTravelSignal } from 'oxidjs';

const [count, setCount] = createSignalPair(0);

// Keep track of the last 5 values
const countHistory = createHistorySignal(count, 5);

// Support undo/redo operations
const timeTravel = createTimeTravelSignal(count);

setCount(1);
setCount(2);
setCount(3);

console.log(countHistory.values()); // [0, 1, 2, 3]
console.log(countHistory.at(-2)); // 2 (second-to-last value)

// Undo last change
timeTravel.undo();
console.log(timeTravel()); // 2

// Redo the change
timeTravel.redo();
console.log(timeTravel()); // 3
```

### Signal Families

```typescript
import { createSignalFamily } from 'oxidjs';

// Create a family of signals for user data
const userFamily = createSignalFamily<User, string>(
  (userId) => ({ loading: true }) // initial value factory
);

// Get or create a signal for a specific user
const user1 = userFamily.get('user-1');
const user2 = userFamily.get('user-2');

// Set values
userFamily.set('user-1', { loading: false, data: { name: 'Alice' } });

// Check if a user exists in the family
console.log(userFamily.has('user-1')); // true
```

## Resource Signals for Async Data

```typescript
import { createResource } from 'oxidjs';

// Create a resource signal
const userResource = createResource(
  () => fetch('/api/user').then(res => res.json()),
  {
    initialData: null,
    cacheTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 30 * 1000 // 30 seconds
  }
);

// Access the resource state
createEffect(() => {
  if (userResource.loading()) {
    console.log('Loading user...');
  } else if (userResource.error()) {
    console.log('Error loading user:', userResource.error());
  } else {
    console.log('User data:', userResource.data());
  }
});

// Manually refetch
function refreshData() {
  userResource.refetch();
}

// Manually update data
function updateUser(newData) {
  userResource.mutate(newData);
}
```

## Dependency Injection

```typescript
import { createInjectionKey, provide, inject, createScope } from 'oxidjs';

// Create a typed injection key
const UserServiceKey = createInjectionKey<UserService>('UserService');

// Provide a value
provide(UserServiceKey, new UserService());

// Create a scope for hierarchical injection
const result = createScope(() => {
  // Override the value in this scope
  provide(UserServiceKey, new MockUserService());
  
  // Inject the value (will be MockUserService in this scope)
  const userService = inject(UserServiceKey);
  return userService.getUser();
});

// Inject a value with a default
const themeService = inject(ThemeServiceKey, new DefaultThemeService());
```

## Reactive Context

```typescript
import { createContextKey, createReactiveContext, createReactiveScope } from 'oxidjs';

// Create a context key
const ThemeKey = createContextKey<Theme>('theme');

// Create a reactive context
const themeContext = createReactiveContext(ThemeKey, { dark: false });

// Read from the context
createEffect(() => {
  const theme = themeContext.get();
  console.log('Current theme:', theme.dark ? 'dark' : 'light');
});

// Set a new context value
themeContext.set({ dark: true });

// Run a function with a specific context value
themeContext.provide({ dark: false }, () => {
  // Inside this function, the theme is light
  console.log(themeContext.get().dark); // false
});

// Create a derived context
const isDarkTheme = themeContext.derive(theme => theme.dark);
console.log(isDarkTheme.get()); // true

// Create a scope that automatically cleans up
const cleanup = createReactiveScope(() => {
  // Create effects, etc.
  const subscription = someObservable.subscribe();
  
  // Return cleanup function
  return () => subscription.unsubscribe();
});

// Later, call cleanup() to clean up resources
```

## Global State Management

```typescript
import { createStore } from 'oxidjs';

// Create a store
const authStore = createStore({
  user: null,
  isAuthenticated: false,
  token: null
});

// Read values
createEffect(() => {
  const isAuthenticated = authStore.get('isAuthenticated')();
  console.log('Auth state:', isAuthenticated ? 'logged in' : 'logged out');
});

// Update values
function login(userData, token) {
  authStore.set('user', userData);
  authStore.set('token', token);
  authStore.set('isAuthenticated', true);
}

function logout() {
  // Reset to initial values
  authStore.reset();
}

// Create a derived store
const userStore = authStore.derive(state => ({
  displayName: state.user?.name || 'Guest',
  profileUrl: state.user?.avatar || '/default-avatar.png'
}));

console.log(userStore.get('displayName')()); // "Guest"
```

## Reactive Query

```typescript
import { createQuery, createMutation, createInfiniteQuery } from 'oxidjs';

// Create a query
const usersQuery = createQuery(
  'users',
  () => fetch('/api/users').then(res => res.json()),
  {
    refetchInterval: 60000, // 1 minute
    staleTime: 30000, // 30 seconds
    retry: 3
  }
);

// Access query state
createEffect(() => {
  if (usersQuery.isLoading()) {
    console.log('Loading users...');
  } else if (usersQuery.isError()) {
    console.log('Error:', usersQuery.error());
  } else {
    console.log('Users:', usersQuery.data());
  }
});

// Create a mutation
const updateUserMutation = createMutation(
  (userData) => fetch(`/api/users/${userData.id}`, {
    method: 'PUT',
    body: JSON.stringify(userData)
  }).then(res => res.json()),
  {
    onSuccess: (data) => {
      console.log('User updated:', data);
      usersQuery.refetch(); // Refresh the query
    }
  }
);

// Use the mutation
function updateUser(user) {
  updateUserMutation.mutate(user);
}

// Infinite query for pagination
const postsQuery = createInfiniteQuery(
  'posts',
  (pageParam = 0) => fetch(`/api/posts?page=${pageParam}`).then(res => res.json()),
  {
    getNextPageParam: (lastPage, allPages) => {
      return lastPage.hasMore ? allPages.length : undefined;
    }
  }
);

// Load more data
function loadMorePosts() {
  if (postsQuery.hasNextPage()) {
    postsQuery.fetchNextPage();
  }
}
```

## Reactive Forms

```typescript
import { createForm, createFormField, required, email, minLength } from 'oxidjs';

// Create a form
const loginForm = createForm({
  initialValues: {
    email: '',
    password: '',
    rememberMe: false
  },
  onValuesChange: (values) => {
    console.log('Form values changed:', values);
  }
});

// Register fields with validation
const emailField = loginForm.registerField('email', {
  initialValue: '',
  validators: [
    required('Email is required'),
    email('Invalid email format')
  ]
});

const passwordField = loginForm.registerField('password', {
  initialValue: '',
  validators: [
    required('Password is required'),
    minLength(8, 'Password must be at least 8 characters')
  ]
});

// Subscribe to form state
createEffect(() => {
  const formState = loginForm();
  console.log('Form state:', {
    isValid: formState.isValid,
    isDirty: formState.isDirty,
    isTouched: formState.isTouched
  });
});

// Handle form submission
const handleSubmit = loginForm.handleSubmit((values) => {
  // This only runs if validation passes
  console.log('Submitting:', values);
  return fetch('/api/login', {
    method: 'POST',
    body: JSON.stringify(values)
  });
});

// Use with regular form events
function onSubmit(e) {
  handleSubmit(e); // Prevents default and handles validation
}

// Access field state
createEffect(() => {
  const field = emailField();
  console.log('Email field:', {
    value: field.value,
    errors: field.errors,
    touched: field.touched,
    dirty: field.dirty
  });
});

// Reset the form
function resetForm() {
  loginForm.reset();
}
```

## Reactive Actions

Reactive Actions provide a centralized way to track, audit, and time-travel through user actions in an application.

```typescript
import { 
  createActionManager, 
  createAction, 
  createReducer, 
  loggerMiddleware 
} from 'oxidjs';

// Define action types
const INCREMENT = 'counter/increment';
const DECREMENT = 'counter/decrement';
const RESET = 'counter/reset';

// Create action creators
const increment = createAction<number>(INCREMENT); // with payload
const decrement = createAction<number>(DECREMENT);
const reset = createAction<void>(RESET); // without payload

// Define state interface
interface CounterState {
  count: number;
  lastChanged: number;
}

// Initial state
const initialState: CounterState = {
  count: 0,
  lastChanged: Date.now()
};

// Create reducer
const counterReducer = createReducer<CounterState>(initialState, {
  [INCREMENT]: (state, action) => ({
    count: state.count + (action.payload || 1),
    lastChanged: Date.now()
  }),
  [DECREMENT]: (state, action) => ({
    count: state.count - (action.payload || 1),
    lastChanged: Date.now()
  }),
  [RESET]: (state) => ({
    count: 0,
    lastChanged: Date.now()
  })
});

// Create action manager
const actions = createActionManager(counterReducer, {
  initialState,
  historyLimit: 100, // keep last 100 actions
  enableTimeTravel: true,
  persist: true, // save to localStorage
  storageKey: 'counter-app-actions'
});

// Add middleware for logging
actions.use(loggerMiddleware());

// Dispatch actions
actions.dispatch(increment(5)); // count = 5
actions.dispatch(decrement(2)); // count = 3

// Get current state
console.log(actions.state().count); // 3

// Subscribe to actions
const unsubscribe = actions.on(INCREMENT, (payload) => {
  console.log(`Incremented by ${payload}`);
});

// Time travel
actions.undo(); // go back to previous action
actions.redo(); // go forward to next action

// Jump to a specific action
actions.jumpToAction(2); // jump to the 3rd action (index 2)

// Get action history
console.log(actions.history().actions); // array of all actions
console.log(actions.history().canUndo); // whether undo is available
```

## Reactive Storage

Reactive Storage provides a way to persist reactive state to localStorage or sessionStorage with automatic serialization.

```typescript
import { 
  createLocalStorage, 
  createSessionStorage, 
  createExpiringStorage,
  createSchemaValidator
} from 'oxidjs';

// Simple local storage
const counterStorage = createLocalStorage('counter', 0);

// Get current value
console.log(counterStorage.get()); // 0

// Update value (triggers save to localStorage)
counterStorage.set(5);
counterStorage.set(prev => prev + 1); // 6

// Reset to initial value
counterStorage.reset(); // back to 0

// Remove from storage
counterStorage.remove();

// Schema validation for complex objects
const userSchema = {
  type: 'object',
  required: ['username', 'email'],
  properties: {
    username: { type: 'string' },
    email: { type: 'string' },
    preferences: {
      type: 'object',
      properties: {
        theme: { type: 'string' }
      }
    }
  }
};

const { serializer, deserializer } = createSchemaValidator(
  userSchema,
  (error) => console.error('Validation error:', error)
);

// Session storage with schema validation
const userSessionStorage = createSessionStorage(
  'user-session',
  { username: 'guest', email: 'guest@example.com', preferences: { theme: 'light' } }
);

// Storage that expires after 24 hours
const tokenStorage = createExpiringStorage(
  'auth-token',
  null,
  24 * 60 * 60 * 1000 // 24 hours
);

// Set a value that will expire
tokenStorage.set('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...');

// Change the storage key
userSessionStorage.setKey('user-session-v2');
```

## Reactive Mediator

Reactive Mediator provides a decoupled communication mechanism between components using a publish-subscribe pattern.

```typescript
import { 
  createMediator, 
  createTypedChannel, 
  createChannelSignal,
  request,
  createResponder
} from 'oxidjs';

// Create a mediator
const mediator = createMediator({
  logging: true, // log all events
  maxEvents: 50, // keep last 50 events per channel
  persistKey: 'app-events' // persist to localStorage
});

// Define typed events for better type safety
interface AppEvents {
  'notification.show': { message: string; type: 'info' | 'success' | 'error' };
  'theme.change': 'light' | 'dark';
  'user.login': { username: string; id: number };
  'user.logout': void;
}

// Create typed channels
const channels = createTypedChannel<AppEvents>(mediator);

// Subscribe to notifications
const unsubscribe = channels['notification.show'].subscribe(
  event => {
    console.log(`${event.payload.type}: ${event.payload.message}`);
  },
  { includePast: true } // receive past events too
);

// Publish to a channel
channels['notification.show'].publish({
  message: 'Hello world',
  type: 'info'
});

// Get current value from a channel
const currentTheme = channels['theme.change'].current();

// Create a signal linked to a channel
const [theme, setTheme] = createChannelSignal(
  channels['theme.change'],
  'light' // default value
);

// When the signal changes, the channel is updated automatically
setTheme('dark');

// Request-response pattern
createResponder(
  mediator,
  'user.fetch',
  'user.fetch.response',
  async (payload: { id: number }) => {
    // Simulate API call
    const user = await fetchUserFromApi(payload.id);
    return user;
  }
);

// Make a request
const user = await request(
  mediator,
  'user.fetch',
  'user.fetch.response',
  { id: 123 },
  5000 // timeout in ms
);

// Get all events in a channel
const allNotifications = channels['notification.show'].events();

// Clear a channel
channels['notification.show'].clear();

// Remove a channel
mediator.removeChannel('user.logout');

// Get all channel names
const allChannels = mediator.channels();
```

## Reactive Router

The Reactive Router provides a client-side routing solution for single-page applications (SPAs) with reactive state management for route changes.

### Features

- Declarative route definitions with path patterns
- Route parameters and query string handling
- Navigation guards for authentication and authorization
- History management (back, forward, replace)
- Route-based code splitting support
- Nested routes

### Usage

```typescript
import { createRouter, RouteParams, NavigateOptions } from 'oxidjs';

// Define your routes
const router = createRouter({
  base: '', // Base URL path
  routes: [
    { id: 'home', path: '/', exact: true },
    { id: 'users', path: '/users' },
    { id: 'user', path: '/users/:id' },
    { id: 'notFound', path: '/404', default: true }
  ],
  // Use hash-based routing (#/path) instead of history API
  hashMode: false,
  // Default route when none match
  defaultRoute: '/',
  // Scroll behavior after navigation
  scrollBehavior: 'smooth',
  scrollToTop: true
});

// Access current route state reactively
const currentRoute = router.currentRoute;
const location = router.location;

// Navigate programmatically
router.navigate('/users/123');
router.navigateTo('user', { id: '123' });

// With options
const options: NavigateOptions = {
  replace: true, // Replace instead of push
  query: { tab: 'profile' },
  hash: 'details',
  state: { from: 'dashboard' }
};
router.navigate('/users/123', options);

// Navigation guards
router.beforeEach((to, from) => {
  // Return false to cancel navigation
  // Return a string path to redirect
  // Return void/true to continue
  if (to.pathname.includes('admin') && !isAdmin()) {
    return '/login';
  }
});

router.afterEach((to, from) => {
  // Track analytics, etc.
  analytics.pageView(to.pathname);
});

// Create predefined guards
const authGuard = createAuthGuard(
  () => Boolean(localStorage.getItem('token')),
  '/login'
);

router.beforeEach(authGuard);

// Check active routes
if (router.isActive('/users')) {
  // Current route starts with /users
}

if (router.isRouteActive('user', true)) {
  // Exact match for 'user' route
}

// Generate URLs from route definitions
const profileUrl = router.getRouteUrl('user', { id: '123' }, { 
  query: { tab: 'settings' } 
});

// Access route parameters
const userId = router.location().params.id;

// Access query parameters
const tab = router.location().query.tab;
```

### Link Component Implementation Example

```typescript
function Link({ to, params, options, children }) {
  const href = router.getRouteUrl(to, params, options);
  
  const handleClick = (e) => {
    e.preventDefault();
    router.navigateTo(to, params, options);
  };
  
  return (
    <a href={href} onClick={handleClick}>
      {children}
    </a>
  );
}
```

### Route-based Code Splitting Example

```typescript
// Define routes with lazy loading
const routes = [
  { 
    id: 'home',
    path: '/', 
    component: () => import('./views/Home.vue')
  },
  { 
    id: 'users',
    path: '/users',
    component: () => import('./views/Users.vue'),
    // Route requires authentication
    requiresAuth: true,
    // Required roles for this route
    roles: ['admin', 'manager']
  }
];

// Router view implementation
function RouterView() {
  const route = router.currentRoute();
  const [Component, setComponent] = createSignalPair(null);
  
  createEffect(() => {
    if (route?.component) {
      route.component().then(module => {
        setComponent(() => module.default);
      });
    }
  });
  
  return Component ? <Component /> : <LoadingSpinner />;
}
```

## License

MIT 