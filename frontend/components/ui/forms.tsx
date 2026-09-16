import * as React from 'react';
import { cn } from '@/lib/utils';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => <input ref={ref} className={cn('input', className)} {...props} />);
Input.displayName = 'Input';
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...props }, ref) => <select ref={ref} className={cn('input', className)} {...props} />);
Select.displayName = 'Select';
export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => <textarea ref={ref} className={cn('input min-h-24 py-2', className)} {...props} />);
Textarea.displayName = 'Textarea';
export const Label = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(({ className, ...props }, ref) => <label ref={ref} className={cn('mb-1.5 block text-sm font-semibold text-foreground', className)} {...props} />);
Label.displayName = 'Label';
export function FieldDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) { return <p className={cn('mt-1 text-caption text-muted', className)} {...props} />; }
export function FieldError({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) { return <p role="alert" className={cn('mt-1 text-caption font-medium text-danger', className)} {...props} />; }
