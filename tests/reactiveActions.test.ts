import { describe, expect, jest, test, beforeEach } from '@jest/globals';
import {
  createAction,
  createActionGroup,
  createReducer,
  dispatch,
  getActions,
  createMiddleware,
  applyMiddleware
} from '../src/reactiveActions';

describe('ReactiveActions', () => {
  // Reset the action registry before each test
  beforeEach(() => {
    // Clear any registered actions
    dispatch({ type: '@@INIT' });
  });

  describe('createAction', () => {
    test('should create an action creator', () => {
      const increment = createAction('counter/increment');
      const action = increment();

      expect(action).toEqual({ type: 'counter/increment' });
      expect(increment.type).toBe('counter/increment');
    });

    test('should include payload in action', () => {
      const addTodo = createAction<{ text: string }>('todos/add');
      const action = addTodo({ text: 'Buy milk' });

      expect(action).toEqual({
        type: 'todos/add',
        payload: { text: 'Buy milk' }
      });
    });

    test('should accept payload creator', () => {
      const addTodo = createAction('todos/add', (text: string) => ({
        text,
        id: expect.any(String),
        completed: false
      }));

      const action = addTodo('Buy milk');

      expect(action).toEqual({
        type: 'todos/add',
        payload: {
          text: 'Buy milk',
          id: expect.any(String),
          completed: false
        }
      });
    });

    test('should handle metadata', () => {
      const fetchData = createAction<{ query: string }, { source: string }>(
        'data/fetch',
        undefined,
        () => ({ source: 'api' })
      );

      const action = fetchData({ query: 'test' });

      expect(action).toEqual({
        type: 'data/fetch',
        payload: { query: 'test' },
        meta: { source: 'api' }
      });
    });
  });

  describe('createActionGroup', () => {
    test('should create a group of related actions', () => {
      const counterActions = createActionGroup('counter', {
        increment: () => ({}),
        decrement: () => ({}),
        incrementBy: (amount: number) => ({ payload: amount })
      });

      expect(counterActions.increment()).toEqual({ type: 'counter/increment' });
      expect(counterActions.decrement()).toEqual({ type: 'counter/decrement' });
      expect(counterActions.incrementBy(5)).toEqual({
        type: 'counter/incrementBy',
        payload: 5
      });
    });

    test('should preserve action types', () => {
      const todoActions = createActionGroup('todos', {
        add: (text: string) => ({ payload: { text, id: '1', completed: false } }),
        toggle: (id: string) => ({ payload: id }),
        remove: (id: string) => ({ payload: id })
      });

      expect(todoActions.add.type).toBe('todos/add');
      expect(todoActions.toggle.type).toBe('todos/toggle');
      expect(todoActions.remove.type).toBe('todos/remove');
    });
  });

  describe('createReducer', () => {
    test('should create a reducer function', () => {
      const increment = createAction('counter/increment');
      const decrement = createAction('counter/decrement');
      const incrementBy = createAction<number>('counter/incrementBy');

      const counterReducer = createReducer(0, (builder) => {
        builder
          .addCase(increment, (state) => state + 1)
          .addCase(decrement, (state) => state - 1)
          .addCase(incrementBy, (state, action) => state + action.payload);
      });

      let state = counterReducer(undefined, { type: '@@INIT' });
      expect(state).toBe(0);

      state = counterReducer(state, increment());
      expect(state).toBe(1);

      state = counterReducer(state, decrement());
      expect(state).toBe(0);

      state = counterReducer(state, incrementBy(5));
      expect(state).toBe(5);
    });

    test('should handle complex state', () => {
      interface Todo {
        id: string;
        text: string;
        completed: boolean;
      }

      const initialState: Todo[] = [];

      const todoActions = createActionGroup('todos', {
        add: (text: string) => ({
          payload: { id: String(Date.now()), text, completed: false }
        }),
        toggle: (id: string) => ({ payload: id }),
        remove: (id: string) => ({ payload: id })
      });

      const todosReducer = createReducer(initialState, (builder) => {
        builder
          .addCase(todoActions.add, (state, action) => {
            state.push(action.payload);
          })
          .addCase(todoActions.toggle, (state, action) => {
            const todo = state.find(todo => todo.id === action.payload);
            if (todo) {
              todo.completed = !todo.completed;
            }
          })
          .addCase(todoActions.remove, (state, action) => {
            return state.filter(todo => todo.id !== action.payload);
          });
      });

      let state = todosReducer(undefined, { type: '@@INIT' });
      expect(state).toEqual([]);

      const todo = { id: '1', text: 'Buy milk', completed: false };
      state = todosReducer(state, todoActions.add('Buy milk'));
      expect(state[0].text).toBe('Buy milk');
      expect(state[0].completed).toBe(false);

      state = todosReducer(state, todoActions.toggle(state[0].id));
      expect(state[0].completed).toBe(true);

      state = todosReducer(state, todoActions.remove(state[0].id));
      expect(state).toEqual([]);
    });

    test('should handle default case', () => {
      const increment = createAction('counter/increment');

      const counterReducer = createReducer(0, (builder) => {
        builder
          .addCase(increment, (state) => state + 1)
          .addDefaultCase((state) => state);
      });

      let state = counterReducer(0, { type: 'UNKNOWN_ACTION' });
      expect(state).toBe(0);
    });

    test('should handle matcher cases', () => {
      const actionCreators = {
        increment: createAction('counter/increment'),
        incrementBy: createAction<number>('counter/incrementBy'),
        reset: createAction('counter/reset')
      };

      // Matcher that matches any action with a type that starts with 'counter/'
      const isCounterAction = (action: { type: string }) => 
        action.type.startsWith('counter/');

      const counterReducer = createReducer(0, (builder) => {
        builder
          .addCase(actionCreators.reset, () => 0)
          .addMatcher(isCounterAction, (state, action) => {
            if (action.type === actionCreators.increment.type) {
              return state + 1;
            }
            if (action.type === actionCreators.incrementBy.type && 'payload' in action) {
              return state + (action.payload as number);
            }
            return state;
          });
      });

      let state = counterReducer(5, actionCreators.increment());
      expect(state).toBe(6);

      state = counterReducer(state, actionCreators.incrementBy(3));
      expect(state).toBe(9);

      state = counterReducer(state, actionCreators.reset());
      expect(state).toBe(0);
    });
  });

  describe('dispatch and getActions', () => {
    test('should dispatch actions and allow subscribing to them', () => {
      const increment = createAction('counter/increment');
      const decrement = createAction('counter/decrement');

      const mockListener = jest.fn();
      const unsubscribe = getActions().subscribe(mockListener);

      dispatch(increment());
      dispatch(decrement());

      expect(mockListener).toHaveBeenCalledTimes(2);
      expect(mockListener).toHaveBeenCalledWith(increment());
      expect(mockListener).toHaveBeenCalledWith(decrement());

      unsubscribe();
      dispatch(increment());
      expect(mockListener).toHaveBeenCalledTimes(2); // No additional calls
    });

    test('should support filtering actions', () => {
      const todoActions = createActionGroup('todos', {
        add: (text: string) => ({ payload: { text } }),
        remove: (id: string) => ({ payload: id })
      });

      const userActions = createActionGroup('users', {
        login: (username: string) => ({ payload: { username } }),
        logout: () => ({})
      });

      const todoListener = jest.fn();
      const userListener = jest.fn();

      // Subscribe to todo actions only
      const todoUnsubscribe = getActions('todos/').subscribe(todoListener);

      // Subscribe to user actions only
      const userUnsubscribe = getActions('users/').subscribe(userListener);

      dispatch(todoActions.add('Buy milk'));
      dispatch(userActions.login('john'));
      dispatch(todoActions.remove('1'));
      dispatch(userActions.logout());

      expect(todoListener).toHaveBeenCalledTimes(2);
      expect(todoListener).toHaveBeenCalledWith(todoActions.add('Buy milk'));
      expect(todoListener).toHaveBeenCalledWith(todoActions.remove('1'));

      expect(userListener).toHaveBeenCalledTimes(2);
      expect(userListener).toHaveBeenCalledWith(userActions.login('john'));
      expect(userListener).toHaveBeenCalledWith(userActions.logout());

      // Unsubscribe
      todoUnsubscribe();
      userUnsubscribe();
    });
  });

  describe('middleware', () => {
    test('should apply middleware to the dispatch pipeline', () => {
      const increment = createAction('counter/increment');

      const loggerMiddleware = createMiddleware((action, next) => {
        const result = next(action);
        return result;
      });

      const mockNext = jest.fn(action => action);
      const enhancedDispatch = applyMiddleware(loggerMiddleware)(mockNext);

      enhancedDispatch(increment());

      expect(mockNext).toHaveBeenCalledWith(increment());
    });

    test('should support multiple middleware in the right order', () => {
      const increment = createAction('counter/increment');
      const callOrder: string[] = [];

      const firstMiddleware = createMiddleware((action, next) => {
        callOrder.push('first-before');
        const result = next(action);
        callOrder.push('first-after');
        return result;
      });

      const secondMiddleware = createMiddleware((action, next) => {
        callOrder.push('second-before');
        const result = next(action);
        callOrder.push('second-after');
        return result;
      });

      const mockNext = jest.fn(action => {
        callOrder.push('dispatch');
        return action;
      });

      const enhancedDispatch = applyMiddleware(
        firstMiddleware,
        secondMiddleware
      )(mockNext);

      enhancedDispatch(increment());

      expect(callOrder).toEqual([
        'first-before',
        'second-before',
        'dispatch',
        'second-after',
        'first-after'
      ]);
    });

    test('should support middleware that transforms actions', () => {
      const increment = createAction('counter/increment');
      const transformMiddleware = createMiddleware((action, next) => {
        if (action.type === increment.type) {
          return next({
            ...action,
            meta: { transformed: true }
          });
        }
        return next(action);
      });

      const mockNext = jest.fn(action => action);
      const enhancedDispatch = applyMiddleware(transformMiddleware)(mockNext);

      const result = enhancedDispatch(increment());

      expect(mockNext).toHaveBeenCalledWith({
        type: 'counter/increment',
        meta: { transformed: true }
      });

      expect(result).toEqual({
        type: 'counter/increment',
        meta: { transformed: true }
      });
    });

    test('should support middleware that intercepts actions', () => {
      const increment = createAction('counter/increment');
      const decrement = createAction('counter/decrement');

      const filterMiddleware = createMiddleware((action, next) => {
        if (action.type === decrement.type) {
          // Don't pass this action to next middleware
          return { type: 'FILTERED' };
        }
        return next(action);
      });

      const mockNext = jest.fn(action => action);
      const enhancedDispatch = applyMiddleware(filterMiddleware)(mockNext);

      enhancedDispatch(increment());
      enhancedDispatch(decrement());

      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(mockNext).toHaveBeenCalledWith(increment());
      expect(mockNext).not.toHaveBeenCalledWith(decrement());
    });
  });
}); 