import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Fragment, type ReactNode } from 'react';
import { classNames } from '~/utils/classNames';

export interface SelectOption<T extends string = string> {
  value: T;
  label: ReactNode;

  /** Options sharing a group are listed under that heading, like <optgroup>. */
  group?: string;
}

interface SelectProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  options: SelectOption<T>[];
  id?: string;
  disabled?: boolean;
  placeholder?: ReactNode;

  /** Needed when no <label htmlFor={id}> points at the select. */
  'aria-label'?: string;

  /** Extra trigger classes; use `!` to override the default skin (no class merging here). */
  className?: string;
  contentClassName?: string;
}

/** Themed replacement for the native <select>, built on the Radix dropdown used elsewhere in the app. */
export function Select<T extends string>({
  value,
  onValueChange,
  options,
  id,
  disabled,
  placeholder = 'Select…',
  'aria-label': ariaLabel,
  className,
  contentClassName,
}: SelectProps<T>) {
  const selected = options.find((option) => option.value === value);

  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild disabled={disabled}>
        <button
          type="button"
          id={id}
          aria-label={ariaLabel}
          className={classNames(
            'flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm',
            'bg-bolt-elements-background-depth-2 text-bolt-elements-textPrimary',
            'border border-bolt-elements-borderColor',
            'hover:border-purple-500/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/30',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'transition-colors duration-200',
            className,
          )}
        >
          <span className="truncate">{selected?.label ?? placeholder}</span>
          <span aria-hidden className="i-ph:caret-down shrink-0 text-bolt-elements-textTertiary" />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        {/* z-[10001] keeps the menu above every dialog in the app (highest overlay is z-[10000]) */}
        <DropdownMenu.Content
          align="start"
          sideOffset={4}
          className={classNames(
            'z-[10001] max-h-72 min-w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto rounded-lg py-1',
            'bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor shadow-lg',
            'animate-in fade-in-0 zoom-in-95',
            contentClassName,
          )}
        >
          <DropdownMenu.RadioGroup value={value} onValueChange={(next) => onValueChange(next as T)}>
            {options.map((option, index) => (
              <Fragment key={option.value}>
                {option.group && option.group !== options[index - 1]?.group && (
                  <DropdownMenu.Label className="px-3 pb-1 pt-2 text-xs font-medium text-bolt-elements-textTertiary">
                    {option.group}
                  </DropdownMenu.Label>
                )}
                <DropdownMenu.RadioItem
                  value={option.value}
                  className={classNames(
                    'flex cursor-pointer items-center gap-2 py-2 pl-8 pr-3 text-sm outline-none relative',
                    'text-bolt-elements-textPrimary',
                    'data-[highlighted]:bg-purple-500/10 data-[highlighted]:text-purple-500',
                  )}
                >
                  <DropdownMenu.ItemIndicator className="absolute left-3 flex items-center">
                    <span className="i-ph:check text-purple-500" />
                  </DropdownMenu.ItemIndicator>
                  {option.label}
                </DropdownMenu.RadioItem>
              </Fragment>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
