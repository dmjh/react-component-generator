import type { ReactNode } from 'react';

interface WindowProps {
  title: string;
  className?: string;
  onClose?: () => void;
  closeLabel?: string;
  children: ReactNode;
}

export function Window({ title, className = '', onClose, closeLabel = '닫기', children }: WindowProps) {
  return (
    <section className={`window ${className}`.trim()}>
      <div className="titlebar">
        {onClose ? (
          <button
            type="button"
            className="close-box"
            onClick={onClose}
            aria-label={closeLabel}
            title={closeLabel}
          />
        ) : (
          <span className="close-box close-box--idle" aria-hidden="true" />
        )}
        <span className="titlebar-label">{title}</span>
      </div>
      <div className="window-body">{children}</div>
    </section>
  );
}
