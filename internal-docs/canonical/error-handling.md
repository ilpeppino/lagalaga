# Error Handling Documentation

## Table of Contents

1. [Error Philosophy](#error-philosophy)
2. [Error Class Hierarchy](#error-class-hierarchy)
3. [Error Codes Reference](#error-codes-reference)
4. [API Envelope Format](#api-envelope-format)
5. [Error Boundaries](#error-boundaries)
6. [Error Recovery](#error-recovery)
7. [useErrorHandler Hook](#useerrorhandler-hook)
8. [Error Presenter](#error-presenter)

---

## Error Philosophy

### Operational vs Programmer Errors

**Operational Errors** are expected runtime conditions that can occur in normal application flow:
- Network failures
- Invalid user input
- Authentication failures
- Resource not found
- Rate limiting
- External service unavailability

These errors should be:
- Caught and handled gracefully
- Presented to users with actionable messages
- Logged for monitoring
- Retried when appropriate

**Programmer Errors** are bugs in the code:
- Null pointer exceptions
- Type errors
- Logic errors
- Invalid function arguments

These errors should:
- Fail fast to prevent data corruption
- Be logged with full stack traces
- Trigger alerts in production
- Be fixed through code updates

### Fail-Fast Principle

When encountering programmer errors or unrecoverable conditions:
1. Throw immediately to prevent cascading failures
2. Log comprehensive error context
3. Avoid silent failures or invalid state propagation
4. Use type systems and validation to catch errors early

### Structured Error Responses

All errors in LagaLaga follow a consistent structure:
- **Error Code**: Machine-readable identifier (e.g., `AUTH_TOKEN_EXPIRED`)
- **Message**: Human-readable description
- **Status Code**: HTTP status code for API errors
- **Additional Context**: Relevant metadata (field names, retry hints, etc.)

---

## Error Class Hierarchy

### Backend Error Classes

#### AppError (Base Class)

```typescript
class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public statusCode: number = 500,
    public details?: Record<string, any>
  )
}
```

Base class for all application errors. Provides consistent structure across the backend.

#### AuthError

```typescript
class AuthError extends AppError {
  constructor(code: ErrorCode, message: string, details?: Record<string, any>)
  // statusCode: 401
}
```

Used for authentication failures:
- Invalid credentials
- Token expiration
- Missing authentication
- Insufficient permissions

#### SessionError

```typescript
class SessionError extends AppError {
  constructor(code: ErrorCode, message: string, statusCode?: number, details?: Record<string, any>)
  // default statusCode: 400
}
```

Used for gaming session errors:
- Session not found (404)
- Session full (409)
- User already joined (409)
- Session access denied (403)

#### ValidationError

```typescript
class ValidationError extends AppError {
  constructor(
    code: ErrorCode,
    message: string,
    public fieldErrors?: Record<string, string>
  )
  // statusCode: 400
}
```

Used for input validation failures:
- Invalid field formats
- Missing required fields
- Business rule violations
- Constraint violations

#### NotFoundError

```typescript
class NotFoundError extends AppError {
  constructor(resource: string, identifier?: string)
  // statusCode: 404
}
```

Used when requested resources don't exist:
- User not found
- Post not found
- Resource not found

#### ConflictError

```typescript
class ConflictError extends AppError {
  constructor(code: ErrorCode, message: string, details?: Record<string, any>)
  // statusCode: 409
}
```

Used for state conflicts:
- Duplicate resources
- Version conflicts
- Concurrent modification

#### RateLimitError

```typescript
class RateLimitError extends AppError {
  constructor(
    retryAfter?: number,
    limit?: number,
    window?: number
  )
  // statusCode: 429
}
```

Used when rate limits are exceeded. Includes retry timing information.

#### ExternalServiceError

```typescript
class ExternalServiceError extends AppError {
  constructor(
    service: string,
    originalError?: Error,
    details?: Record<string, any>
  )
  // statusCode: 502
}
```

Used for third-party service failures:
- OAuth provider errors
- Database connection issues
- External API failures

### Frontend Error Classes

#### ApiError

```typescript
class ApiError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public statusCode: number,
    public details?: Record<string, any>
  )
}
```

Represents errors returned from API calls. Constructed from API error responses.

#### NetworkError

```typescript
class NetworkError extends Error {
  constructor(
    message: string,
    public originalError?: Error
  )
}
```

Represents network-level failures:
- Connection timeouts
- DNS resolution failures
- Network unavailability

---

## Error Codes Reference

All error codes are defined in `shared/errors/codes.ts` and used across backend and frontend. Codes use short symbolic names as the `ErrorCodes` enum key; the string value sent over the wire is the numeric code (e.g., `AUTH_001`).

### Authentication Errors (AUTH_*)

| Symbolic Key | Wire Value | Description | HTTP Status |
|---|---|---|---|
| `AUTH_INVALID_CREDENTIALS` | `AUTH_001` | Invalid credentials or code verifier | 401 |
| `AUTH_TOKEN_EXPIRED` | `AUTH_002` | Authentication token has expired | 401 |
| `AUTH_INVALID_STATE` | `AUTH_003` | OAuth state is invalid or expired | 401 |
| `AUTH_OAUTH_FAILED` | `AUTH_004` | OAuth exchange or token validation failed | 401 |
| `AUTH_UNAUTHORIZED` | `AUTH_005` | No valid authentication token provided | 401 |
| `AUTH_FORBIDDEN` | `AUTH_006` | Account is pending deletion or unavailable | 403 |
| `AUTH_TOKEN_REVOKED` | `AUTH_007` | Refresh token has been revoked | 401 |

### Session (Gaming) Errors (SESSION_*)

| Symbolic Key | Wire Value | Description | HTTP Status |
|---|---|---|---|
| `SESSION_NOT_FOUND` | `SESSION_001` | Session does not exist | 404 |
| `SESSION_FULL` | `SESSION_002` | Session has reached max participants | 409 |
| `SESSION_ALREADY_JOINED` | `SESSION_003` | User has already joined the session | 409 |
| `SESSION_NOT_ACTIVE` | `SESSION_004` | Session is not in an active state | 409 |
| `SESSION_CREATE_FAILED` | `SESSION_005` | Failed to create session | 500 |
| `SESSION_ACCESS_DENIED` | `SESSION_006` | User does not have access to this session | 403 |

### Validation Errors (VAL_*)

| Symbolic Key | Wire Value | Description | HTTP Status |
|---|---|---|---|
| `VALIDATION_ERROR` | `VAL_001` | Input validation failed | 400 |
| `VALIDATION_MISSING_FIELDS` | `VAL_002` | Required field is missing | 400 |
| `VALIDATION_INVALID_FORMAT` | `VAL_003` | Field format is invalid | 400 |

### Network Errors (NET_*)

| Symbolic Key | Wire Value | Description | HTTP Status |
|---|---|---|---|
| `NETWORK_OFFLINE` | `NET_001` | Device is offline | 503 |
| `NETWORK_TIMEOUT` | `NET_002` | Request timeout exceeded | 504 |
| `NETWORK_REQUEST_FAILED` | `NET_003` | Network request failed | 503 |

### Not Found Errors (NOT_FOUND_*)

| Symbolic Key | Wire Value | Description | HTTP Status |
|---|---|---|---|
| `NOT_FOUND` | `NOT_FOUND_001` | Generic resource not found | 404 |
| `NOT_FOUND_INVITE` | `NOT_FOUND_002` | Invite code not found | 404 |
| `NOT_FOUND_USER` | `NOT_FOUND_003` | User not found | 404 |

### Rate Limit Errors (RATE_*)

| Symbolic Key | Wire Value | Description | HTTP Status |
|---|---|---|---|
| `RATE_LIMIT_EXCEEDED` | `RATE_001` | Too many requests | 429 |

### Internal Errors (INT_*)

| Symbolic Key | Wire Value | Description | HTTP Status |
|---|---|---|---|
| `INTERNAL_ERROR` | `INT_001` | Internal server error | 500 |
| `INTERNAL_DB_ERROR` | `INT_002` | Database operation failed | 500 |
| `INTERNAL_EXTERNAL_SERVICE` | `INT_003` | External service (Roblox API, etc.) failed | 502 |

### Conflict Errors (CONFLICT_*)

| Symbolic Key | Wire Value | Description | HTTP Status |
|---|---|---|---|
| `CONFLICT` | `CONFLICT_001` | Generic resource conflict | 409 |

### Friend Errors (FRIEND_*)

| Symbolic Key | Wire Value | Description | HTTP Status |
|---|---|---|---|
| `FRIEND_SELF_REQUEST` | `FRIEND_001` | Cannot send friend request to yourself | 400 |
| `FRIEND_ALREADY_EXISTS` | `FRIEND_002` | Friendship already exists | 409 |
| `FRIEND_REQUEST_EXISTS` | `FRIEND_003` | Friend request already pending | 409 |
| `FRIEND_BLOCKED` | `FRIEND_004` | User is blocked | 403 |
| `FRIEND_NOT_FOUND` | `FRIEND_005` | Friendship not found | 404 |
| `FRIEND_NOT_PENDING` | `FRIEND_006` | Friend request is not in pending state | 409 |
| `FRIEND_NOT_RECIPIENT` | `FRIEND_007` | Current user is not the request recipient | 403 |
| `FRIEND_SYNC_FAILED` | `FRIEND_008` | Roblox friends cache sync failed | 502 |
| `FRIEND_RATE_LIMITED` | `FRIEND_009` | Friends sync rate limited | 429 |
| `FRIEND_NOT_AUTHORIZED` | `FRIEND_010` | Not authorized for this friendship operation | 403 |

### Account Linking Errors

These codes use string keys (not the `AUTH_*` numeric pattern) since they are domain-specific conflict types.

| Wire Value | Description | HTTP Status |
|---|---|---|
| `ACCOUNT_LINK_CONFLICT` | Platform account already linked to another LagaLaga account (generic) | 409 |
| `CONFLICT_ACCOUNT_PROVIDER` | Platform account linked to a different user (Google/Apple/Roblox) | 409 |
| `ACCOUNT_LINK_SAME_PROVIDER_DUPLICATE` | This provider account is already linked to this user | 409 |
| `ACCOUNT_LINK_INVALID_STATE` | OAuth state is invalid or expired during link flow | 401 |

---

## API Envelope Format

All API responses follow a consistent envelope format to distinguish between success and error states.

### ApiSuccessResponse

```typescript
interface ApiSuccessResponse<T = any> {
  success: true;
  data: T;
  meta?: {
    timestamp: string;
    requestId?: string;
    pagination?: {
      page: number;
      limit: number;
      total: number;
      hasMore: boolean;
    };
  };
}
```

**Example JSON:**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "usr_123",
      "email": "user@example.com",
      "name": "John Doe"
    }
  },
  "meta": {
    "timestamp": "2026-02-08T12:34:56Z",
    "requestId": "req_abc123"
  }
}
```

### ApiErrorResponse

```typescript
interface ApiErrorResponse {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, any>;
    fieldErrors?: Record<string, string>;
    retryAfter?: number;
    stackTrace?: string; // Only in development
  };
  meta?: {
    timestamp: string;
    requestId?: string;
  };
}
```

**Example JSON (Validation Error):**

```json
{
  "success": false,
  "error": {
    "code": "VAL_INVALID_EMAIL",
    "message": "Invalid email format",
    "fieldErrors": {
      "email": "Please enter a valid email address"
    }
  },
  "meta": {
    "timestamp": "2026-02-08T12:34:56Z",
    "requestId": "req_xyz789"
  }
}
```

**Example JSON (Rate Limit Error):**

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests",
    "retryAfter": 60,
    "details": {
      "limit": 100,
      "window": 3600,
      "remaining": 0
    }
  },
  "meta": {
    "timestamp": "2026-02-08T12:34:56Z"
  }
}
```

---

## Error Boundaries

Error boundaries catch React component errors and provide fallback UI to prevent app crashes.

### ErrorBoundary Component

Location: `components/ErrorBoundary.tsx`

```typescript
interface ErrorBoundaryProps {
  children: React.ReactNode;
  level?: 'app' | 'screen' | 'component';
  fallback?: (error: Error, reset: () => void) => React.ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}
```

### Level Prop

Controls the scope and fallback behavior:

**`level="app"`** (Root level)
- Catches all unhandled errors in the app
- Shows full-screen error state
- Offers app restart option
- Used in `App.tsx` root component

**`level="screen"`** (Screen level)
- Catches errors within a specific screen
- Shows screen-level error state
- Allows navigation back
- Used to wrap individual screens

**`level="component"`** (Component level)
- Catches errors in specific components
- Shows inline error message
- Rest of the screen remains functional
- Used for isolated UI components

### Usage Examples

**App Level:**

```typescript
// App.tsx
<ErrorBoundary level="app" onError={logErrorToService}>
  <NavigationContainer>
    <RootNavigator />
  </NavigationContainer>
</ErrorBoundary>
```

**Screen Level:**

```typescript
// HomeScreen.tsx
<ErrorBoundary
  level="screen"
  fallback={(error, reset) => (
    <ScreenErrorState
      message="Failed to load home feed"
      onRetry={reset}
    />
  )}
>
  <HomeScreenContent />
</ErrorBoundary>
```

**Component Level:**

```typescript
// UserProfile.tsx
<ErrorBoundary
  level="component"
  fallback={(error) => (
    <Text>Unable to load user profile</Text>
  )}
>
  <UserProfileCard userId={userId} />
</ErrorBoundary>
```

### Fallback Rendering

Default fallback behavior by level:

```typescript
// App level: Full screen error
<View style={styles.errorContainer}>
  <Text style={styles.errorTitle}>Something went wrong</Text>
  <Text style={styles.errorMessage}>{error.message}</Text>
  <Button title="Restart App" onPress={reset} />
</View>

// Screen level: Screen error state
<View style={styles.screenError}>
  <Text>Unable to load this screen</Text>
  <Button title="Go Back" onPress={navigation.goBack} />
  <Button title="Try Again" onPress={reset} />
</View>

// Component level: Inline error
<View style={styles.inlineError}>
  <Text style={styles.errorText}>Failed to load content</Text>
</View>
```

---

## Error Recovery

### withRetry Utility

Automatically retries failed operations with exponential backoff.

```typescript
async function withRetry<T>(
  operation: () => Promise<T>,
  options?: {
    maxRetries?: number;
    baseDelay?: number;
    maxDelay?: number;
    shouldRetry?: (error: Error) => boolean;
  }
): Promise<T>
```

**Usage:**

```typescript
import { withRetry } from '@/utils/retry';

const user = await withRetry(
  () => api.getUser(userId),
  {
    maxRetries: 3,
    baseDelay: 1000,
    shouldRetry: (error) => error instanceof NetworkError
  }
);
```

**Default Behavior:**
- Max retries: 3
- Base delay: 1000ms
- Exponential backoff: delay * 2^attempt
- Max delay: 30000ms (30 seconds)
- Retries network errors and 5xx status codes

### CircuitBreaker

Prevents cascading failures by stopping requests to failing services.

```typescript
class CircuitBreaker {
  constructor(options?: {
    failureThreshold?: number;
    resetTimeout?: number;
    monitoringWindow?: number;
  })

  async execute<T>(operation: () => Promise<T>): Promise<T>
  getState(): 'CLOSED' | 'OPEN' | 'HALF_OPEN'
}
```

**States:**
- **CLOSED**: Normal operation, requests pass through
- **OPEN**: Too many failures, requests fail immediately
- **HALF_OPEN**: Testing if service recovered

**Usage:**

```typescript
import { CircuitBreaker } from '@/utils/circuitBreaker';

const breaker = new CircuitBreaker({
  failureThreshold: 5,
  resetTimeout: 60000,
});

try {
  const result = await breaker.execute(() =>
    externalApi.fetchData()
  );
} catch (error) {
  // Circuit is open or operation failed
}
```

### Frontend Retry Logic (api.ts)

The API client in `src/lib/api.ts` implements automatic retry logic:

```typescript
// Automatic retry for network errors
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 3
): Promise<Response> {
  try {
    return await fetch(url, options);
  } catch (error) {
    if (retries > 0 && isNetworkError(error)) {
      await delay(1000 * (4 - retries)); // Exponential backoff
      return fetchWithRetry(url, options, retries - 1);
    }
    throw new NetworkError('Network request failed', error);
  }
}
```

**Automatic Retry Conditions:**
- Network timeouts (NET_TIMEOUT)
- Connection failures (NET_CONNECTION_FAILED)
- 503 Service Unavailable
- 504 Gateway Timeout

**No Retry Conditions:**
- 4xx client errors (except 429)
- Authentication errors
- Validation errors
- Not found errors

---

## useErrorHandler Hook

Custom hook for consistent error handling in React components.

Location: `hooks/useErrorHandler.ts`

```typescript
interface UseErrorHandlerReturn {
  handleError: (error: Error, context?: string) => void;
  clearError: () => void;
  error: Error | null;
}

function useErrorHandler(): UseErrorHandlerReturn
```

### Basic Usage

Replace `console.error` + `Alert.alert` patterns with centralized error handling:

**Before:**

```typescript
try {
  await api.updateProfile(data);
} catch (error) {
  console.error('Profile update failed:', error);
  Alert.alert('Error', 'Failed to update profile');
}
```

**After:**

```typescript
const { handleError } = useErrorHandler();

try {
  await api.updateProfile(data);
} catch (error) {
  handleError(error, 'Profile update');
}
```

### Advanced Usage Examples

**Form Submission:**

```typescript
const { handleError } = useErrorHandler();
const [isSubmitting, setIsSubmitting] = useState(false);

const handleSubmit = async (formData: FormData) => {
  setIsSubmitting(true);
  try {
    await api.createPost(formData);
    navigation.goBack();
  } catch (error) {
    handleError(error, 'Post creation');
  } finally {
    setIsSubmitting(false);
  }
};
```

**Data Fetching:**

```typescript
const { handleError, error, clearError } = useErrorHandler();
const [data, setData] = useState(null);
const [loading, setLoading] = useState(true);

useEffect(() => {
  const fetchData = async () => {
    try {
      clearError();
      const result = await api.getUserPosts(userId);
      setData(result);
    } catch (error) {
      handleError(error, 'Loading posts');
    } finally {
      setLoading(false);
    }
  };

  fetchData();
}, [userId]);

// Display inline error
if (error) {
  return <ErrorMessage error={error} onRetry={fetchData} />;
}
```

**Multiple Error Sources:**

```typescript
const { handleError } = useErrorHandler();

const handleLike = async (postId: string) => {
  try {
    await api.likePost(postId);
  } catch (error) {
    handleError(error, 'Like post');
  }
};

const handleComment = async (postId: string, text: string) => {
  try {
    await api.createComment(postId, text);
  } catch (error) {
    handleError(error, 'Post comment');
  }
};
```

### Features

- **Automatic logging**: All errors logged with context
- **User notifications**: Shows appropriate UI based on error type
- **Error tracking**: Integrates with error monitoring services
- **Presentation strategy**: Delegates to errorPresenter for display logic

---

## Error Presenter

The error presenter maps error codes to user-friendly messages and determines presentation strategy.

Location: `src/lib/errorPresenter.ts`

### Presentation Strategies

**Alert** - Modal alert dialog for critical errors:
- Authentication failures
- Permission denied
- Account issues
- Critical operations failed

**Inline** - Inline error message within the UI:
- Form validation errors
- Field-specific errors
- Non-critical failures
- Recoverable errors

**Silent** - Logged but not shown to user:
- Analytics errors
- Background sync failures
- Non-essential operations
- Recoverable background tasks

**Toast** - Brief notification (optional strategy):
- Success confirmations
- Minor errors
- Informational messages

### Error Code Mapping

```typescript
interface ErrorPresentation {
  title: string;
  message: string;
  strategy: 'alert' | 'inline' | 'silent' | 'toast';
  action?: {
    label: string;
    handler: () => void;
  };
}

function presentError(error: Error): ErrorPresentation
```

### Example Mappings

**Authentication Errors:**

```typescript
AUTH_TOKEN_EXPIRED => {
  title: 'Session Expired',
  message: 'Please sign in again to continue',
  strategy: 'alert',
  action: {
    label: 'Sign In',
    handler: () => navigation.navigate('SignIn')
  }
}

AUTH_INSUFFICIENT_PERMISSIONS => {
  title: 'Access Denied',
  message: 'You don\'t have permission to perform this action',
  strategy: 'alert'
}
```

**Validation Errors:**

```typescript
VAL_INVALID_EMAIL => {
  title: 'Invalid Email',
  message: 'Please enter a valid email address',
  strategy: 'inline' // Shows next to email field
}

VAL_INVALID_PASSWORD => {
  title: 'Invalid Password',
  message: 'Password must be at least 8 characters',
  strategy: 'inline'
}
```

**Network Errors:**

```typescript
NET_OFFLINE => {
  title: 'No Connection',
  message: 'Please check your internet connection and try again',
  strategy: 'alert',
  action: {
    label: 'Retry',
    handler: () => retryOperation()
  }
}

NET_TIMEOUT => {
  title: 'Request Timeout',
  message: 'The request took too long. Please try again',
  strategy: 'toast' // Less intrusive for timeout
}
```

**Rate Limit Errors:**

```typescript
RATE_LIMIT_EXCEEDED => {
  title: 'Too Many Requests',
  message: 'Please wait a moment before trying again',
  strategy: 'alert'
}
```

**Silent Errors:**

```typescript
INT_ANALYTICS_ERROR => {
  strategy: 'silent' // Logged but not shown
}

INT_BACKGROUND_SYNC_FAILED => {
  strategy: 'silent' // Will retry automatically
}
```

### Custom Presentation

For specific contexts, override default presentation:

```typescript
import { presentError } from '@/lib/errorPresenter';

const { handleError } = useErrorHandler();

const handleCriticalOperation = async () => {
  try {
    await api.deleteAccount();
  } catch (error) {
    // Override to always show alert for critical operations
    const presentation = presentError(error);
    Alert.alert(
      presentation.title,
      presentation.message,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: presentation.action?.label || 'OK',
          onPress: presentation.action?.handler
        }
      ]
    );
  }
};
```

### Field Error Mapping

For form validation, field errors are mapped to specific inputs:

```typescript
// API returns fieldErrors
{
  "fieldErrors": {
    "email": "Email is already registered",
    "username": "Username contains invalid characters"
  }
}

// Presenter maps to form fields
<TextInput
  error={fieldErrors.email}
  helperText={fieldErrors.email}
/>
<TextInput
  error={fieldErrors.username}
  helperText={fieldErrors.username}
/>
```

---

## Best Practices

### DO

1. Use typed error codes from `shared/errors/codes.ts`
2. Include context when throwing errors
3. Use appropriate error classes (AuthError, ValidationError, etc.)
4. Handle errors at the appropriate level (component, screen, app)
5. Provide actionable error messages to users
6. Log errors with sufficient context for debugging
7. Use retry mechanisms for transient failures
8. Test error handling paths

### DON'T

1. Swallow errors silently without logging
2. Show technical error messages to users
3. Use generic error messages ("Something went wrong")
4. Retry non-idempotent operations without user confirmation
5. Catch errors without proper handling
6. Expose sensitive information in error messages
7. Use console.error in production code (use proper logging)
8. Forget to clean up resources in error paths

---

## Error Monitoring

All errors should be logged to monitoring services for:
- Error tracking and alerting
- Performance monitoring
- User impact analysis
- Debugging production issues

Integration points:
- Backend: Error middleware logs to monitoring service
- Frontend: `useErrorHandler` reports to error tracking
- ErrorBoundary: Reports component errors

---

## Related Documentation

- [API Documentation](./api.md) - API endpoint specifications
- [Authentication Flow](./authentication.md) - Auth error handling
- [Testing Guide](./testing.md) - Testing error scenarios
- [Deployment Guide](./deployment.md) - Production error monitoring

---

**Last Updated**: 2026-03-10
**Version**: 1.1.0
