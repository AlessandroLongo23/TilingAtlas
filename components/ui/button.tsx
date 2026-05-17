"use client";

import type { ComponentProps, ComponentType, ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg" | "icon";

interface CommonProps {
	variant?: Variant;
	size?: Size;
	icon?: ComponentType<{ className?: string }>;
	label?: ReactNode;
	fullWidth?: boolean;
	classes?: string;
	children?: ReactNode;
}

// When `href` is set, renders a Next.js <Link>; otherwise a <button>.
type ButtonAsButton = CommonProps &
	Omit<ComponentProps<"button">, "className" | keyof CommonProps> & {
		href?: undefined;
	};

type ButtonAsLink = CommonProps &
	Omit<ComponentProps<typeof Link>, "className" | keyof CommonProps> & {
		href: string;
	};

export type ButtonProps = ButtonAsButton | ButtonAsLink;

const VARIANT_CLASSES: Record<Variant, string> = {
	primary:
		"bg-accent hover:bg-accent-hover active:bg-accent-active text-accent-contrast border border-transparent",
	secondary:
		"bg-surface-overlay/40 hover:bg-surface-overlay/70 text-fg-secondary hover:text-fg border border-line hover:border-line-strong",
	ghost:
		"bg-transparent hover:bg-surface-overlay/70 text-fg-muted hover:text-fg border border-transparent",
	danger:
		"bg-danger-subtle hover:bg-danger text-danger hover:text-fg-inverse border border-danger/40",
};

const SIZE_CLASSES: Record<Size, string> = {
	sm: "h-8 px-3 text-xs gap-1.5 rounded-control",
	md: "h-10 px-4 text-sm gap-2 rounded-control",
	lg: "h-12 px-6 text-base gap-2.5 rounded-control",
	icon: "h-8 w-8 rounded-control",
};

const ICON_SIZE: Record<Size, string> = {
	sm: "w-3.5 h-3.5",
	md: "w-4 h-4",
	lg: "w-5 h-5",
	icon: "w-4 h-4",
};

const BASE =
	"inline-flex items-center justify-center font-medium transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-line-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

function isLinkProps(p: ButtonProps): p is ButtonAsLink {
	return "href" in p && p.href !== undefined;
}

function computeClassName(p: CommonProps) {
	return cn(
		BASE,
		VARIANT_CLASSES[p.variant ?? "secondary"],
		SIZE_CLASSES[p.size ?? "md"],
		p.fullWidth ? "w-full" : "",
		p.classes,
	);
}

function renderContent(p: CommonProps) {
	const size = p.size ?? "md";
	const { icon: Icon, label, children } = p;
	return (
		<>
			{Icon ? <Icon className={ICON_SIZE[size]} /> : null}
			{size === "icon" ? null : (label ?? children)}
		</>
	);
}

function ButtonAsLinkRender(props: ButtonAsLink) {
	const {
		variant: _v,
		size: _s,
		icon: _i,
		label: _l,
		fullWidth: _fw,
		classes: _c,
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
		label: _l,
		fullWidth: _fw,
		classes: _c,
		children: _ch,
		disabled,
		...buttonRest
	} = props;
	return (
		<button
			{...buttonRest}
			disabled={disabled}
			aria-disabled={disabled}
			className={cn(
				computeClassName(props),
				disabled ? "opacity-50 cursor-not-allowed pointer-events-none" : "cursor-pointer",
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
