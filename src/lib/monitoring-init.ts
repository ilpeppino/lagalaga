import { monitoring } from './monitoring';
import { SENTRY_DSN } from './runtimeConfig';
import { initializeSentry, SentryMonitoringProvider } from './sentryMonitoringProvider';

let monitoringInitialized = false;

export function initializeMonitoring(): void {
  if (monitoringInitialized) {
    return;
  }

  if (SENTRY_DSN) {
    initializeSentry(SENTRY_DSN);
    monitoring.setProvider(new SentryMonitoringProvider());
  }

  monitoringInitialized = true;
}
