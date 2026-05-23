import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '../../lib/utils';

export const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap',
    'rounded-md font-[650] leading-none border-0 outline-none cursor-pointer',
    'transition-all duration-[180ms] ease-out',
    'hover:-translate-y-0.5 active:translate-y-0',
    'disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
  ],
  {
    variants: {
      variant: {
        primary:
          'bg-kb-text text-surface hover:bg-kb-text/80 hover:shadow-[0_4px_16px_rgba(0,0,0,0.18)]',
        secondary:
          'bg-surface text-kb-text ring-1 ring-inset ring-line-strong hover:bg-bg hover:ring-line',
        ghost:
          'bg-transparent text-kb-text/70 ring-1 ring-inset ring-line hover:bg-kb-text/[0.055] hover:text-kb-text hover:ring-line-strong',
        accent:
          'bg-accent text-white hover:bg-accent/85 hover:shadow-[0_4px_16px_rgba(12,102,255,0.28)]',
        outline:
          'bg-transparent text-kb-text ring-1 ring-inset ring-line-strong hover:ring-accent hover:text-accent',
      },
      size: {
        sm: 'px-[0.75rem] py-[0.38rem] text-[0.8rem]',
        md: 'px-[1.1rem]  py-[0.65rem] text-[0.95rem]',
        lg: 'px-[1.6rem]  py-[0.9rem]  text-[1.05rem]',
        icon: 'size-9 p-0',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

export type ButtonVariants = VariantProps<typeof buttonVariants>;

type ButtonBaseProps = ButtonVariants & {
  className?: string;
  children?: React.ReactNode;
};

type ButtonAsButton = ButtonBaseProps &
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, keyof ButtonBaseProps> & {
    href?: undefined;
    asChild?: false;
  };

type ButtonAsLink = ButtonBaseProps &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, keyof ButtonBaseProps> & {
    href: string;
    asChild?: false;
  };

export type ButtonProps = ButtonAsButton | ButtonAsLink;

export const Button = React.forwardRef<
  HTMLButtonElement | HTMLAnchorElement,
  ButtonProps
>(({ className, variant, size, children, href, ...props }, ref) => {
  const classes = cn(buttonVariants({ variant, size }), className);

  if (href !== undefined) {
    return (
      <a
        href={href}
        ref={ref as React.Ref<HTMLAnchorElement>}
        className={classes}
        {...(props as React.AnchorHTMLAttributes<HTMLAnchorElement>)}
      >
        {children}
      </a>
    );
  }

  return (
    <button
      ref={ref as React.Ref<HTMLButtonElement>}
      className={classes}
      {...(props as React.ButtonHTMLAttributes<HTMLButtonElement>)}
    >
      {children}
    </button>
  );
});

Button.displayName = 'Button';
