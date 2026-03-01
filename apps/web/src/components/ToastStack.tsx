type Toast = {
  id: number;
  message: string;
};

type ToastStackProps = {
  toasts: Toast[];
};

export function ToastStack({ toasts }: ToastStackProps) {
  return (
    <div className="toast-stack pointer-events-none fixed bottom-6 left-1/2 z-[130] grid -translate-x-1/2 justify-items-center gap-2" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <div key={toast.id} className="toast-item min-w-[280px] max-w-[min(560px,88vw)]">
          {toast.message}
        </div>
      ))}
    </div>
  );
}