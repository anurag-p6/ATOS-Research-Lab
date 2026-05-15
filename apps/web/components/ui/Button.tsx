'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { forwardRef } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  leading?: ReactNode;
  trailing?: ReactNode;
}

const VARIANT: Record<Variant, string> = {
  primary: 'atos-btn atos-btn-primary',
  secondary: 'atos-btn',
  ghost: 'atos-btn atos-btn-ghost',
  danger:
    'atos-btn border-operator-danger/60 text-operator-danger hover:border-operator-danger hover:text-operator-danger hover:shadow-[0_0_18px_rgba(239,68,68,0.18)]',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', leading, trailing, className = '', children, ...rest },
  ref,
) {
  return (
    <button ref={ref} className={`${VARIANT[variant]} ${className}`} {...rest}>
      {leading}
      <span className="truncate">{children}</span>
      {trailing}
    </button>
  );
});
