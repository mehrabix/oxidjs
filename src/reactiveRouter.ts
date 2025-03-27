import { createSignalPair, ReadonlySignal } from './signal';

/**
 * Route parameters dictionary
 */
export type RouteParams = Record<string, string>;

/**
 * Route query parameters dictionary
 */
export type QueryParams = Record<string, string | string[] | null>;

/**
 * Route state that can be passed between routes
 */
export type RouteState = Record<string, any>;

/**
 * A route location description
 */
export interface RouteLocation {
  /** The full pathname */
  pathname: string;
  /** The route parameters extracted from the URL */
  params: RouteParams;
  /** The query parameters extracted from the URL */
  query: QueryParams; 
  /** The hash part of the URL (without #) */
  hash: string;
  /** Any state associated with this route */
  state: RouteState;
}

/**
 * A route definition
 */
export interface Route {
  /** The route path pattern (e.g., "/users/:id") */
  path: string;
  /** Unique identifier for this route */
  id: string;
  /** Optional name for this route */
  name?: string;
  /** Whether this route should exact match the path */
  exact?: boolean;
  /** Whether this route should be the default (404) when no other routes match */
  default?: boolean;
  /** Whether this route requires authentication */
  requiresAuth?: boolean;
  /** Any roles required to access this route */
  roles?: string[];
  /** Any metadata for this route */
  meta?: Record<string, any>;
}

/**
 * Navigation direction
 */
export type NavigationDirection = 'forward' | 'back' | 'replace';

/**
 * Navigation options
 */
export interface NavigateOptions {
  /** Replace current history entry instead of pushing a new one */
  replace?: boolean;
  /** State to associate with the route */
  state?: RouteState;
  /** Query parameters to include */
  query?: QueryParams;
  /** Hash to include */
  hash?: string;
  /** Whether to preserve existing query parameters (merge) */
  preserveQuery?: boolean;
  /** Whether to preserve existing hash */
  preserveHash?: boolean;
  /** Whether to preserve existing state (merge) */
  preserveState?: boolean;
}

/**
 * Route guard function to control navigation
 */
export type RouteGuard = (
  to: RouteLocation,
  from: RouteLocation | null
) => boolean | Promise<boolean> | string | Promise<string> | void | Promise<void> | undefined | Promise<undefined | string | boolean | void>;

/**
 * History object for route navigation
 */
export interface RouterHistory {
  /** Current route location */
  location: ReadonlySignal<RouteLocation>;
  /** Navigate to a path */
  push: (path: string, options?: NavigateOptions) => Promise<boolean>;
  /** Navigate to a route by id with params */
  navigateTo: (routeId: string, params?: RouteParams, options?: NavigateOptions) => Promise<boolean>;
  /** Replace current entry with a path */
  replace: (path: string, options?: NavigateOptions) => Promise<boolean>;
  /** Go back in history */
  back: () => void;
  /** Go forward in history */
  forward: () => void;
  /** Go to a specific entry in the history stack */
  go: (delta: number) => void;
}

/**
 * Router options
 */
export interface RouterOptions {
  /** Base URL path for all routes */
  base?: string;
  /** Available routes */
  routes?: Route[];
  /** Whether to use hash-based routing */
  hashMode?: boolean;
  /** Default route to redirect to when none match */
  defaultRoute?: string;
  /** Global guards that run before navigation */
  beforeEach?: RouteGuard[];
  /** Global guards that run after successful navigation */
  afterEach?: ((to: RouteLocation, from: RouteLocation | null) => void)[];
  /** Scroll behavior after navigation */
  scrollBehavior?: 'auto' | 'smooth' | false;
  /** Whether to scroll to top after navigation */
  scrollToTop?: boolean;
  /** Callback for handling errors during navigation */
  onError?: (error: any, to: RouteLocation, from: RouteLocation | null) => void;
}

/**
 * A reactive router
 */
export interface ReactiveRouter {
  /** The current route location */
  location: ReadonlySignal<RouteLocation>;
  /** Available routes */
  routes: ReadonlySignal<Route[]>;
  /** Current matched route */
  currentRoute: ReadonlySignal<Route | null>;
  /** Navigation history */
  history: RouterHistory;
  /** Navigate to a URL */
  navigate: (path: string, options?: NavigateOptions) => Promise<boolean>;
  /** Navigate to a route by id */
  navigateTo: (routeId: string, params?: RouteParams, options?: NavigateOptions) => Promise<boolean>;
  /** Check if the given path is the current route */
  isActive: (path: string, exact?: boolean) => boolean;
  /** Check if the given route id is the current route */
  isRouteActive: (routeId: string, exact?: boolean) => boolean;
  /** Get URL for a route */
  getRouteUrl: (routeId: string, params?: RouteParams, options?: NavigateOptions) => string;
  /** Add a route */
  addRoute: (route: Route) => void;
  /** Remove a route */
  removeRoute: (routeId: string) => boolean;
  /** Add a global before guard */
  beforeEach: (guard: RouteGuard) => () => void;
  /** Add a global after guard */
  afterEach: (callback: (to: RouteLocation, from: RouteLocation | null) => void) => () => void;
  /** Refresh the current route */
  refresh: () => Promise<boolean>;
}

/**
 * Route match information
 */
export interface RouteMatch {
  // ... existing code ...
}

/**
 * Extract parameters from a path based on pattern
 */
function extractParams(pattern: string, path: string): RouteParams | null {
  // Convert route pattern to regex
  const regexPattern = pattern
    .replace(/:[a-zA-Z0-9_]+/g, '([^/]+)')
    .replace(/\*/g, '(.*)');
  
  const regex = new RegExp(`^${regexPattern}$`);
  const match = path.match(regex);
  
  if (!match) {
    return null;
  }
  
  // Extract param names from pattern
  const paramNames: string[] = [];
  const paramNameRegex = /:([a-zA-Z0-9_]+)/g;
  let paramMatch;
  
  while ((paramMatch = paramNameRegex.exec(pattern)) !== null) {
    paramNames.push(paramMatch[1]);
  }
  
  // Create params object
  const params: RouteParams = {};
  for (let i = 0; i < paramNames.length; i++) {
    params[paramNames[i]] = match[i + 1];
  }
  
  return params;
}

/**
 * Parse query string into object
 */
function parseQuery(queryString: string): QueryParams {
  if (!queryString) {
    return {};
  }
  
  const query: QueryParams = {};
  const pairs = queryString.split('&');
  
  for (const pair of pairs) {
    const [key, value] = pair.split('=');
    if (!key) continue;
    
    const decodedKey = decodeURIComponent(key);
    const decodedValue = value ? decodeURIComponent(value) : null;
    
    if (decodedKey in query) {
      // If we already have this key, convert to array or add to existing array
      const existingValue = query[decodedKey];
      if (Array.isArray(existingValue)) {
        if (decodedValue !== null) {
          existingValue.push(decodedValue);
        }
      } else {
        if (decodedValue !== null) {
          query[decodedKey] = [existingValue as string, decodedValue];
        }
      }
    } else {
      query[decodedKey] = decodedValue;
    }
  }
  
  return query;
}

/**
 * Stringify query object to query string
 */
function stringifyQuery(query: QueryParams): string {
  if (!query || Object.keys(query).length === 0) {
    return '';
  }
  
  const parts: string[] = [];
  
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined) {
      parts.push(encodeURIComponent(key));
    } else if (Array.isArray(value)) {
      for (const item of value) {
        parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(item)}`);
      }
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
    }
  }
  
  return parts.join('&');
}

/**
 * Parse a URL into its components
 */
function parseUrl(url: string, hashMode: boolean = false): {
  path: string;
  query: QueryParams;
  hash: string;
} {
  if (hashMode) {
    // In hash mode, everything after the # is our "URL"
    const hashIndex = url.indexOf('#');
    if (hashIndex === -1) {
      return { path: '/', query: {}, hash: '' };
    }
    
    url = url.substring(hashIndex + 1);
    if (!url.startsWith('/')) {
      url = '/' + url;
    }
  }
  
  // Parse the URL
  const queryIndex = url.indexOf('?');
  const hashIndex = url.indexOf('#');
  
  let path = url;
  let queryString = '';
  let hash = '';
  
  if (hashIndex !== -1) {
    hash = url.substring(hashIndex + 1);
    path = url.substring(0, hashIndex);
  }
  
  if (queryIndex !== -1) {
    queryString = path.substring(queryIndex + 1);
    path = path.substring(0, queryIndex);
  }
  
  return {
    path,
    query: parseQuery(queryString),
    hash
  };
}

/**
 * Create a URL from components
 */
function createUrl(
  path: string,
  query: QueryParams = {},
  hash: string = '',
  hashMode: boolean = false
): string {
  const queryString = stringifyQuery(query);
  const hashPart = hash ? `#${hash}` : '';
  
  const fullPath = `${path}${queryString ? `?${queryString}` : ''}${hashPart}`;
  
  if (hashMode) {
    return `#${fullPath}`;
  }
  
  return fullPath;
}

/**
 * Build a URL for a route with parameters
 */
function buildUrl(
  pattern: string,
  params: RouteParams = {},
  query: QueryParams = {},
  hash: string = '',
  hashMode: boolean = false
): string {
  // Replace parameters in the pattern
  let path = pattern;
  
  for (const [key, value] of Object.entries(params)) {
    path = path.replace(`:${key}`, encodeURIComponent(value));
  }
  
  // Replace any remaining parameter placeholders
  path = path.replace(/:[a-zA-Z0-9_]+/g, '');
  
  return createUrl(path, query, hash, hashMode);
}

/**
 * Create a reactive router
 */
export function createRouter(options: RouterOptions = {}): ReactiveRouter {
  // Create router with provided options
  const {
    base = '',
    routes: initialRoutes = [],
    hashMode = false,
    defaultRoute,
    scrollBehavior = 'auto',
    scrollToTop = true,
    onError = (error) => console.error('Router navigation error:', error)
  } = options;
  
  // Initialize state
  const [getRoutes, setRoutes] = createSignalPair<Route[]>(initialRoutes);
  const [getLocation, setLocation] = createSignalPair<RouteLocation>(parseCurrentUrl());
  
  // Store guards
  const beforeGuards: RouteGuard[] = options.beforeEach || [];
  const afterGuards: ((to: RouteLocation, from: RouteLocation | null) => void)[] = 
    options.afterEach || [];
  
  // Current navigation
  let currentNavigation: Promise<boolean> | null = null;
  
  // Previous route location (for navigation)
  let previousLocation: RouteLocation | null = null;
  
  /**
   * Find a route by ID
   */
  function findRouteById(id: string): Route | undefined {
    return getRoutes().find(route => route.id === id);
  }
  
  /**
   * Find a route that matches the given path
   */
  function findRouteByPath(path: string): { route: Route; params: RouteParams } | null {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const availableRoutes = getRoutes();
    
    // First try exact matches
    for (const route of availableRoutes) {
      if (route.exact) {
        const params = extractParams(route.path, normalizedPath);
        if (params) {
          return { route, params };
        }
      }
    }
    
    // Then try non-exact matches
    for (const route of availableRoutes) {
      if (!route.exact) {
        const params = extractParams(route.path, normalizedPath);
        if (params) {
          return { route, params };
        }
      }
    }
    
    // If no matches, try finding a default route
    const defaultRouteObj = availableRoutes.find(route => route.default);
    if (defaultRouteObj) {
      return { route: defaultRouteObj, params: {} };
    }
    
    return null;
  }
  
  /**
   * Parse the current browser URL
   */
  function parseCurrentUrl(): RouteLocation {
    const url = window.location.pathname + 
                window.location.search + 
                window.location.hash;
    
    let processedUrl = url;
    
    // Remove base path
    if (base && url.startsWith(base)) {
      processedUrl = url.substring(base.length);
    }
    
    // Ensure URL starts with /
    if (!processedUrl.startsWith('/')) {
      processedUrl = `/${processedUrl}`;
    }
    
    const { path, query, hash } = parseUrl(processedUrl, hashMode);
    
    // Find matching route
    const match = findRouteByPath(path);
    
    if (match) {
      return {
        pathname: path,
        params: match.params,
        query,
        hash,
        state: window.history.state || {}
      };
    }
    
    // No match, return current path info
    return {
      pathname: path,
      params: {},
      query,
      hash,
      state: window.history.state || {}
    };
  }
  
  /**
   * Initialize the router from the current URL
   */
  function initFromCurrentUrl(): void {
    const location = parseCurrentUrl();
    setLocation(location);
  }
  
  /**
   * Get the current matched route
   */
  const getCurrentRoute = (): Route | null => {
    const location = getLocation();
    const match = findRouteByPath(location.pathname);
    return match ? match.route : null;
  };
  
  /**
   * Run navigation guards
   */
  async function runGuards(
    to: RouteLocation,
    from: RouteLocation | null
  ): Promise<boolean | string> {
    // Run before guards
    for (const guard of beforeGuards) {
      try {
        const result = await guard(to, from);
        
        if (result === false) {
          return false;
        }
        
        if (typeof result === 'string') {
          return result;
        }
      } catch (error) {
        onError(error, to, from);
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * Perform navigation
   */
  async function navigate(
    path: string,
    options: NavigateOptions = {}
  ): Promise<boolean> {
    const {
      replace = false,
      state = {},
      query = {},
      hash = '',
      preserveQuery = false,
      preserveHash = false,
      preserveState = false
    } = options;
    
    // Don't navigate if another navigation is in progress
    if (currentNavigation) {
      return currentNavigation;
    }
    
    // Store current location as previous
    previousLocation = getLocation();
    
    // Parse the path
    let processedPath = path;
    
    // Ensure path starts with /
    if (!processedPath.startsWith('/')) {
      processedPath = `/${processedPath}`;
    }
    
    // Ensure base is included
    if (base && !processedPath.startsWith(base)) {
      processedPath = `${base}${processedPath}`;
    }
    
    // Find matching route
    const match = findRouteByPath(processedPath);
    
    if (!match && !options.replace) {
      // Redirect to default route if specified and not already redirecting
      if (defaultRoute && processedPath !== defaultRoute) {
        return navigate(defaultRoute, { replace: true });
      }
    }
    
    // Compute the new location
    const currentLocation = getLocation();
    const newQuery = preserveQuery 
      ? { ...currentLocation.query, ...query } 
      : query;
    const newHash = preserveHash 
      ? currentLocation.hash 
      : hash;
    const newState = preserveState 
      ? { ...currentLocation.state, ...state } 
      : state;
    
    const newLocation: RouteLocation = {
      pathname: processedPath,
      params: match ? match.params : {},
      query: newQuery,
      hash: newHash,
      state: newState
    };
    
    // Start navigation
    currentNavigation = (async () => {
      // Run guards
      const guardResult = await runGuards(newLocation, previousLocation);
      
      if (guardResult === false) {
        return false;
      }
      
      if (typeof guardResult === 'string') {
        currentNavigation = null;
        return navigate(guardResult, options);
      }
      
      // Update URL
      const url = createUrl(
        processedPath,
        newQuery,
        newHash,
        hashMode
      );
      
      if (replace) {
        window.history.replaceState(newState, '', url);
      } else {
        window.history.pushState(newState, '', url);
      }
      
      // Update location
      setLocation(newLocation);
      
      // Handle scroll behavior
      if (scrollToTop && scrollBehavior !== false) {
        window.scrollTo({
          top: 0,
          left: 0,
          behavior: scrollBehavior
        });
      }
      
      // Run after guards
      for (const guard of afterGuards) {
        try {
          guard(newLocation, previousLocation);
        } catch (error) {
          console.error('Error in afterEach guard:', error);
        }
      }
      
      return true;
    })();
    
    try {
      return await currentNavigation;
    } finally {
      currentNavigation = null;
    }
  }
  
  /**
   * Navigate to a route by ID
   */
  async function navigateTo(
    routeId: string,
    params: RouteParams = {},
    options: NavigateOptions = {}
  ): Promise<boolean> {
    const route = findRouteById(routeId);
    
    if (!route) {
      console.error(`Route not found: ${routeId}`);
      return false;
    }
    
    // Build URL from route pattern and params
    const path = buildUrl(
      route.path,
      params,
      options.query || {},
      options.hash || '',
      hashMode
    );
    
    return navigate(path, options);
  }
  
  /**
   * Check if the given path is active
   */
  function isActive(path: string, exact: boolean = false): boolean {
    const location = getLocation();
    
    if (exact) {
      return location.pathname === path;
    }
    
    return location.pathname.startsWith(path);
  }
  
  /**
   * Check if the given route ID is active
   */
  function isRouteActive(routeId: string, exact: boolean = false): boolean {
    const location = getLocation();
    const route = findRouteById(routeId);
    
    if (!route) {
      return false;
    }
    
    // Find matching route for current path
    const match = findRouteByPath(location.pathname);
    
    if (!match) {
      return false;
    }
    
    if (exact) {
      return match.route.id === routeId;
    }
    
    // Non-exact match: check if it's in the hierarchy
    // (this is simplified and might need enhancement for nested routes)
    return match.route.id === routeId || match.route.path.startsWith(route.path);
  }
  
  /**
   * Get URL for a route
   */
  function getRouteUrl(
    routeId: string,
    params: RouteParams = {},
    options: NavigateOptions = {}
  ): string {
    const route = findRouteById(routeId);
    
    if (!route) {
      console.error(`Route not found: ${routeId}`);
      return '';
    }
    
    return buildUrl(
      route.path,
      params,
      options.query || {},
      options.hash || '',
      hashMode
    );
  }
  
  /**
   * Add a route
   */
  function addRoute(route: Route): void {
    setRoutes([...getRoutes(), route]);
  }
  
  /**
   * Remove a route
   */
  function removeRoute(routeId: string): boolean {
    const routes = getRoutes();
    const index = routes.findIndex(r => r.id === routeId);
    
    if (index === -1) {
      return false;
    }
    
    const newRoutes = [...routes];
    newRoutes.splice(index, 1);
    setRoutes(newRoutes);
    
    return true;
  }
  
  /**
   * Add a before guard
   */
  function beforeEachFn(guard: RouteGuard): () => void {
    beforeGuards.push(guard);
    
    // Return unsubscribe function
    return () => {
      const index = beforeGuards.indexOf(guard);
      if (index !== -1) {
        beforeGuards.splice(index, 1);
      }
    };
  }
  
  /**
   * Add an after guard
   */
  function afterEachFn(
    callback: (to: RouteLocation, from: RouteLocation | null) => void
  ): () => void {
    afterGuards.push(callback);
    
    // Return unsubscribe function
    return () => {
      const index = afterGuards.indexOf(callback);
      if (index !== -1) {
        afterGuards.splice(index, 1);
      }
    };
  }
  
  /**
   * Refresh the current route
   */
  function refresh(): Promise<boolean> {
    const location = getLocation();
    return navigate(location.pathname, {
      replace: true,
      state: location.state,
      query: location.query,
      hash: location.hash
    });
  }
  
  // History API
  const history: RouterHistory = {
    location: getLocation,
    push: navigate,
    navigateTo,
    replace: (path, options = {}) => navigate(path, { ...options, replace: true }),
    back: () => window.history.back(),
    forward: () => window.history.forward(),
    go: (delta) => window.history.go(delta)
  };
  
  // Initialize router from current URL
  if (typeof window !== 'undefined') {
    initFromCurrentUrl();
    
    // Listen for popstate events
    window.addEventListener('popstate', () => {
      initFromCurrentUrl();
      
      // Run after guards
      const to = getLocation();
      
      for (const guard of afterGuards) {
        try {
          guard(to, previousLocation);
        } catch (error) {
          console.error('Error in afterEach guard:', error);
        }
      }
      
      // Update previous location
      previousLocation = to;
    });
  }
  
  // Create the router object
  const router: ReactiveRouter = {
    location: getLocation,
    routes: getRoutes,
    currentRoute: getCurrentRoute as ReadonlySignal<Route | null>,
    history,
    navigate,
    navigateTo,
    isActive,
    isRouteActive,
    getRouteUrl,
    addRoute,
    removeRoute,
    beforeEach: beforeEachFn,
    afterEach: afterEachFn,
    refresh
  };
  
  // Store router instance reference for guards
  _globalRouter = router;
  
  return router;
}

/**
 * Create a link function to generate navigation URLs
 */
export function createRouterLink(router: ReactiveRouter) {
  return (
    routeId: string,
    params: RouteParams = {},
    options: NavigateOptions = {}
  ) => router.getRouteUrl(routeId, params, options);
}

// Make router available globally
let _globalRouter: ReactiveRouter | null = null;

/**
 * Create a navigation guard that requires authentication
 */
export function createAuthGuard(
  isAuthenticated: () => boolean | Promise<boolean>,
  loginRoute: string
): RouteGuard {
  return async (to, _from) => {
    // Check if route requires authentication
    // Find the route definition that matches the destination path
    const routes = _globalRouter?.routes() || [];
    for (const route of routes) {
      if (isRouteMatch(route.path, to.pathname) && route.requiresAuth) {
        // If authentication is required but user is not authenticated
        const authenticated = await Promise.resolve(isAuthenticated());
        if (!authenticated) {
          return loginRoute;
        }
        break;
      }
    }
    
    // Allow navigation
    return undefined;
  };
}

/**
 * Create a navigation guard that requires specific roles
 */
export function createRoleGuard(
  getUserRoles: () => string[] | Promise<string[]>,
  unauthorizedRoute: string
): RouteGuard {
  return async (to, _from) => {
    // Find the route definition that matches the destination path
    const routes = _globalRouter?.routes() || [];
    for (const route of routes) {
      if (isRouteMatch(route.path, to.pathname) && route.roles && route.roles.length > 0) {
        // Check if user has required roles
        const userRoles = await Promise.resolve(getUserRoles());
        const requiredRoles = route.roles || [];
        
        // Check if user has at least one of the required roles
        const hasRequiredRole = requiredRoles.some(role => userRoles.includes(role));
        
        if (!hasRequiredRole) {
          return unauthorizedRoute;
        }
        break;
      }
    }
    
    // Allow navigation
    return undefined;
  };
}

/**
 * Helper function to check if a route pattern matches a path
 */
function isRouteMatch(pattern: string, path: string): boolean {
  // Convert route pattern to regex
  const patternRegex = new RegExp(
    `^${pattern.replace(/:[^\s/]+/g, '([^/]+)').replace(/\*/g, '.*')}$`
  );
  
  return patternRegex.test(path);
}

// Create a global router
let router: ReactiveRouter;

/**
 * Get the global router instance
 */
export function getRouter(options: RouterOptions = {}): ReactiveRouter {
  if (!router) {
    router = createRouter(options);
  }
  return router;
} 