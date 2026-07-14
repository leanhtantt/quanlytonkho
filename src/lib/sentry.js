import * as Sentry from '@sentry/react';

const dsn = import.meta.env.VITE_SENTRY_DSN;

if (dsn && import.meta.env.PROD) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    // ponytail: chỉ sample 10% traces, tăng nếu cần debug perf
  });
}

export { Sentry };
