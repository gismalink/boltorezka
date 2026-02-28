type Toast = {
  id: number;
  message: string;
};

type ToastStackProps = {
  toasts: Toast[];
};

export function ToastStack({ toasts }: ToastStackProps) {
  return (
    <div className="toast-stack" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <div key={toast.id} className="toast-item">
          {toast.message}
        </div>
      ))}
    </div>
  );
}