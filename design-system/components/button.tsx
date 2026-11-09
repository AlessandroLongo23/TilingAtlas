"use client";

import type { ComponentProps, ComponentType, ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import { SwapIcon } from "./swap-icon";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "xs" | "sm" | "md" | "lg" | "icon" | "bar";

interface CommonProps {
	variant?: Variant;
	size?: Size;
	icon?: ComponentType<{ className?: string }>;
	/** Trailing icon, after the label. For directional affordances — "go there", "next". */
	iconRight?: ComponentType<{ className?: string }>;
	label?: ReactNode;
	className?: string;
	children?: ReactNode;
}

// When `href` is set, renders a Next.js <Link>; otherwise a <button>.
type ButtonAsButton = CommonProps &
	Omit<ComponentProps<"button">, "className" | keyof CommonProps> & {
		href?: undefined;
		/** An on/off toggle: sets aria-pressed, and pressed reads as held down (sunken, in ink), the look every
		 *  toggle in a toolbar has. */
		pressed?: boolean;
	};

type ButtonAsLink = CommonProps &
	Omit<ComponentProps<typeof Link>, "className" | keyof CommonProps> & {
		href: string;
	};

export type ButtonProps = ButtonAsButton | ButtonAsLink;

// Squared w/b design system: no radii, no accent colour. Hierarchy is carried by ink alone —
// primary is the solid accent, secondary an outline, ghost bare text. Danger keeps its
// semantic red (it signals destruction, not brand).
const VARIANT_CLASSES: Record<Variant, string> = {
	primary:
		"bg-accent text-accent-contrast border border-accent shadow-raised not-disabled:hover:bg-accent-hover not-disabled:active:bg-accent-active",
	secondary: "bg-surface-raised text-fg border border-line shadow-raised not-disabled:hover:bg-surface-overlay",
	ghost:
		"bg-transparent not-disabled:hover:bg-surface-overlay/70 text-fg-muted not-disabled:hover:text-fg border border-transparent",
	danger:
		"bg-danger-subtle not-disabled:hover:bg-danger text-danger not-disabled:hover:text-fg-inverse border border-danger/40",
};

// On a phone every size reaches the 44px touch floor (min-h wins over h); lg is already there.
// Sizes are the control scale (design-system/tokens/semantic.css): compact density puts the default at
// 32px. On a phone every size reaches the 44px touch floor (min-h wins over h).
const SIZE_CLASSES: Record<Size, string> = {
	xs: "h-control-xs px-2 text-small gap-1 max-md:min-h-control-touch", // a hint pill, a figure's control row
	sm: "h-control-sm px-2.5 text-ui gap-1.5 max-md:min-h-control-touch", // dense rows and toolbars
	md: "h-control-md px-3 text-ui gap-1.5 max-md:min-h-control-touch", // the default
	lg: "h-control-lg px-4 text-body gap-2 max-md:min-h-control-touch", // a dialog's or a page's main action
	icon: "size-control-md max-md:min-h-control-touch max-md:min-w-control-touch",
	// A phone bar's icon button (a sheet's close, the menu): the 44px box with a 20px glyph.
	bar: "size-control-touch shrink-0",
};

const ICON_SIZE: Record<Size, string> = {
	xs: "w-3 h-3",
	sm: "w-3.5 h-3.5",
	md: "w-4 h-4",
	lg: "w-5 h-5",
	icon: "w-4 h-4",
	bar: "w-5 h-5",
};

// A press sinks the button a hair (scale 0.97), so the click is felt before anything it starts arrives. A
// pressed toggle (aria-pressed, set by `pressed`) is sunken and in ink, as in the floating toolbar.
const BASE =
	"inline-flex items-center justify-center rounded-control font-medium transition-[color,background-color,border-color,scale] motion-feedback not-disabled:active:scale-[0.97] motion-reduce:active:scale-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 aria-pressed:bg-surface-sunken aria-pressed:text-fg aria-pressed:shadow-none";

function isLinkProps(p: ButtonProps): p is ButtonAsLink {
	return "href" in p && p.href !== undefined;
}

function computeClassName(p: CommonProps) {
	return cn(BASE, VARIANT_CLASSES[p.variant ?? "secondary"], SIZE_CLASSES[p.size ?? "md"], p.className);
}

function renderContent(p: CommonProps) {
	const size = p.size ?? "md";
	const { icon: Icon, iconRight: IconRight, label, children } = p;
	return (
		<>
			{Icon ? <SwapIcon icon={Icon} className={ICON_SIZE[size]} /> : null}
			{/* An icon button has no text; its children are marks on the icon (an unread dot). */}
			{size === "icon" || size === "bar" ? children : (label ?? children)}
			{IconRight && size !== "icon" && size !== "bar" ? <IconRight className={ICON_SIZE[size]} /> : null}
		</>
	);
}

function ButtonAsLinkRender(props: ButtonAsLink) {
	const {
		variant: _v,
		size: _s,
		icon: _i,
		iconRight: _ir,
		label: _l,
		className: _c,
		children: _ch,
		href,
		...linkRest
	} = props;
	return (
		<Link href={href} {...linkRest} className={cn(computeClassName(props), "cursor-pointer")}>
			{renderContent(props)}
		</Link>
	);
}

function ButtonAsButtonRender(props: ButtonAsButton) {
	const {
		variant: _v,
		size: _s,
		icon: _i,
		iconRight: _ir,
		label: _l,
		className: _c,
		children: _ch,
		disabled,
		pressed,
		...buttonRest
	} = props;
	return (
		<button
			aria-pressed={pressed}
			{...buttonRest}
			disabled={disabled}
			aria-disabled={disabled}
			className={cn(
				computeClassName(props),
				// No pointer-events-none: a disabled button still takes the pointer, so a tooltip saying why it is
				// disabled can open. Hover and press only apply when it is enabled (not-disabled: above).
				disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
			)}
		>
			{renderContent(props)}
		</button>
	);
}

export function Button(props: ButtonProps) {
	if (isLinkProps(props)) return <ButtonAsLinkRender {...props} />;
	return <ButtonAsButtonRender {...props} />;
}
