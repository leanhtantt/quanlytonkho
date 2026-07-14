import { toast as sonnerToast } from 'sonner';

const toastError = sonnerToast.error.bind(sonnerToast);

export const toast = Object.assign(
  (...args) => sonnerToast(...args),
  sonnerToast,
  {
    error: (message, options = {}) => toastError(message, { duration: 6000, ...options }),
  },
);
