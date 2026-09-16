"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

export const Tabs = TabsPrimitive.Root;
export const TabsList = ({
  className,
  ...props
}: TabsPrimitive.TabsListProps) => (
  <TabsPrimitive.List
    className={cn(
      "flex max-w-full overflow-x-auto overscroll-x-contain border-b border-border",
      className,
    )}
    {...props}
  />
);
export const TabsTrigger = ({
  className,
  ...props
}: TabsPrimitive.TabsTriggerProps) => (
  <TabsPrimitive.Trigger
    className={cn(
      "relative min-h-11 shrink-0 whitespace-nowrap px-4 text-sm font-semibold text-muted outline-none transition-colors after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-transparent data-[state=active]:text-brand data-[state=active]:after:bg-accent focus-visible:ring-2 focus-visible:ring-brand",
      className,
    )}
    {...props}
  />
);
export const TabsContent = ({
  className,
  ...props
}: TabsPrimitive.TabsContentProps) => (
  <TabsPrimitive.Content
    className={cn(
      "min-w-0 pt-5 outline-none focus-visible:ring-2 focus-visible:ring-brand",
      className,
    )}
    {...props}
  />
);
