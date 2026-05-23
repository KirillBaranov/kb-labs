import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '../../lib/utils';

export const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap',
    'rounded-md font-semibold leading-none border-0 outline-none cursor-pointer',
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
        sm:   'px-3    py-1.5  text-[0.8rem]',
        md:   'px-4    py-2.5  text-[0.9rem]',
        lg:   'px-6    py-3    text-[1rem]',
        icon: 'size-9 p-0',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  }
);

export type ButtonVariants = VariantProps<typeof buttonVariants>;

type ButtonBaseProps = ButtonVariants & {
  className?: string;
  children?: React.ReactNode;
};

type ButtonAsChild = ButtonBaseProps & {
  asChild: true;
  href?: undefined;
} & React.HTMLAttributes<HTMLElement>;

type ButtonAsLink = ButtonBaseProps & {
  asChild?: false;
  href: string;
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, keyof ButtonBaseProps>;

type ButtonAsButton = ButtonBaseProps & {
  asChild?: false;
  href?: undefined;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, keyof ButtonBaseProps>;

export type ButtonProps = ButtonAsChild | ButtonAsLink | ButtonAsButton;

export const Button = React.forwardRef<HTMLElement, ButtonProps>(
  ({ className, variant, size, children, asChild, href, ...props }, ref) => {
    const classes = cn(buttonVariants({ variant, size }), className);

    if (asChild) {
      return (
        <Slot ref={ref as React.Ref<HTMLElement>} className={classes} {...props}>
          {children}
        </Slot>
      );
    }

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
  }
);

Button.displayName = 'Button';
