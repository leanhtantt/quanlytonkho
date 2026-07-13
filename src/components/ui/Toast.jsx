import { Toaster } from 'sonner';

export default function AppToaster() {
  return (
    <Toaster
      position="bottom-right"
      visibleToasts={3}
      closeButton
      toastOptions={{ duration: 3000 }}
    />
  );
}
