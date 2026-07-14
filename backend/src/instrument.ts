import * as Sentry from '@sentry/node';

const dsn = process.env.SENTRY_DSN;

if (dsn && process.env.NODE_ENV === 'production') {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    // ponytail: chỉ sample 10% traces, free tier đủ dùng
    beforeSend(event) {
      // Không gửi PII: xóa email/token khỏi user context, chỉ giữ uid
      if (event.user) {
        delete event.user.email;
        delete event.user.username;
        delete event.user.ip_address;
      }
      return event;
    },
  });
}

export { Sentry };
