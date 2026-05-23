// Primitives
export { Button, buttonVariants } from './components/ui/button';
export type { ButtonProps, ButtonVariants } from './components/ui/button';

export { Eyebrow } from './components/ui/eyebrow';
export type { EyebrowProps } from './components/ui/eyebrow';

export { Badge } from './components/ui/badge';
export type { BadgeProps } from './components/ui/badge';

export { Input } from './components/ui/input';
export type { InputProps } from './components/ui/input';

export { Textarea } from './components/ui/textarea';
export type { TextareaProps } from './components/ui/textarea';

export {
  Select, SelectGroup, SelectValue, SelectTrigger,
  SelectContent, SelectLabel, SelectItem, SelectSeparator,
  SelectScrollUpButton, SelectScrollDownButton,
} from './components/ui/select';

export { FormField } from './components/ui/form-field';
export type { FormFieldProps } from './components/ui/form-field';

export { Alert } from './components/ui/alert';
export type { AlertProps } from './components/ui/alert';

export {
  Dialog, DialogTrigger, DialogPortal, DialogOverlay, DialogClose,
  DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription,
} from './components/ui/dialog';

export {
  Toast, ToastProvider, ToastViewport, ToastTitle, ToastDescription,
  ToastAction, ToastClose,
} from './components/ui/toast';
export type { ToastProps, ToastActionElement, ToastVariant } from './components/ui/toast';

export { Toaster } from './components/ui/toaster';

export { ThemeToggle } from './components/ui/theme-toggle';
export type { ThemeToggleProps } from './components/ui/theme-toggle';

export { GradientText } from './components/ui/gradient-text';
export type { GradientTextProps } from './components/ui/gradient-text';

export { StatCard } from './components/ui/stat-card';
export type { StatCardProps } from './components/ui/stat-card';

export { Skeleton, SkeletonText, SkeletonCard } from './components/ui/skeleton';
export type { SkeletonProps } from './components/ui/skeleton';

export { Tabs } from './components/ui/tabs';
export type { TabsProps, TabItem } from './components/ui/tabs';

export { Accordion } from './components/ui/accordion';
export type { AccordionProps, AccordionItem } from './components/ui/accordion';

export { Tooltip } from './components/ui/tooltip';
export type { TooltipProps } from './components/ui/tooltip';

export { TerminalBlock } from './components/ui/terminal-block';
export type { TerminalBlockProps } from './components/ui/terminal-block';

export { CodeBlock } from './components/ui/code-block';
export type { CodeBlockProps } from './components/ui/code-block';

// Marketing
export { Container } from './components/marketing/container';
export type { ContainerProps } from './components/marketing/container';

export { Section } from './components/marketing/section';
export type { SectionProps } from './components/marketing/section';

export { SectionHeader } from './components/marketing/section-header';
export type { SectionHeaderProps } from './components/marketing/section-header';

export { FeatureCard } from './components/marketing/feature-card';
export type { FeatureCardProps } from './components/marketing/feature-card';

export { StepCard } from './components/marketing/step-card';
export type { StepCardProps } from './components/marketing/step-card';

export { WorkflowDiagram } from './components/marketing/workflow-diagram';
export type { WorkflowDiagramProps } from './components/marketing/workflow-diagram';

export { AgentDiagram } from './components/marketing/agent-diagram';
export type { AgentDiagramProps } from './components/marketing/agent-diagram';

export { WorkflowRunBlock } from './components/marketing/workflow-run-block';
export type { WorkflowRunBlockProps } from './components/marketing/workflow-run-block';

export { WorkflowLiveGraph } from './components/marketing/workflow-live-graph';
export type { WorkflowLiveGraphProps } from './components/marketing/workflow-live-graph';

export { PluginSurfaceDiagram } from './components/marketing/plugin-surface-diagram';
export type { PluginSurfaceDiagramProps } from './components/marketing/plugin-surface-diagram';

export { PluginLifecycleDiagram } from './components/marketing/plugin-lifecycle-diagram';
export type { PluginLifecycleDiagramProps } from './components/marketing/plugin-lifecycle-diagram';

export { GatewayAdapterSwapDiagram } from './components/marketing/gateway-adapter-swap-diagram';
export type { GatewayAdapterSwapDiagramProps } from './components/marketing/gateway-adapter-swap-diagram';

export { PainCards } from './components/marketing/pain-cards';

export { GridSection } from './components/marketing/grid-section';
export type { GridSectionProps } from './components/marketing/grid-section';

export { BentoGrid, BentoCard } from './components/marketing/bento-grid';
export type { BentoGridProps, BentoCardProps } from './components/marketing/bento-grid';

export { GlowCard } from './components/marketing/glow-card';
export type { GlowCardProps } from './components/marketing/glow-card';

export { LogoGrid } from './components/marketing/logo-grid';
export type { LogoGridProps, LogoItem } from './components/marketing/logo-grid';

export { MockupFrame } from './components/marketing/mockup-frame';
export type { MockupFrameProps } from './components/marketing/mockup-frame';

export { PricingCard } from './components/marketing/pricing-card';
export type { PricingCardProps } from './components/marketing/pricing-card';

export { ComparisonTable } from './components/marketing/comparison-table';
export type { ComparisonTableProps, ComparisonCategory, ComparisonRow } from './components/marketing/comparison-table';

export { CookieBanner } from './components/marketing/cookie-banner';
export type { CookieBannerProps } from './components/marketing/cookie-banner';

export { AnnouncementBar } from './components/marketing/announcement-bar';
export type { AnnouncementBarProps } from './components/marketing/announcement-bar';

export { BlogCard } from './components/marketing/blog-card';
export type { BlogCardProps } from './components/marketing/blog-card';

export { TestimonialCard } from './components/marketing/testimonial-card';
export type { TestimonialCardProps } from './components/marketing/testimonial-card';

export { ChangelogEntry } from './components/marketing/changelog-entry';
export type { ChangelogEntryProps, ChangeItem, ChangeType } from './components/marketing/changelog-entry';

export { Prose } from './components/ui/prose';
export type { ProseProps } from './components/ui/prose';

// Effects
export { AnimateOnScroll } from './components/effects/animate-on-scroll';
export type { AnimateOnScrollProps } from './components/effects/animate-on-scroll';

export { GradientOrbs } from './components/effects/gradient-orbs';
export type { GradientOrbsProps } from './components/effects/gradient-orbs';

export { BorderBeam } from './components/effects/border-beam';
export type { BorderBeamProps } from './components/effects/border-beam';

export { DotPattern, GridPattern } from './components/effects/dot-pattern';
export type { DotPatternProps, GridPatternProps } from './components/effects/dot-pattern';

// Hooks
export { useTheme } from './hooks/useTheme';
export type { Theme, ThemePreference } from './hooks/useTheme';

export { useToast, toast } from './hooks/useToast';

// Utils
export { cn } from './lib/utils';
