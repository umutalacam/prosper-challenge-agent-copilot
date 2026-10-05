// The app's icons, all from Bootstrap Icons (react-bootstrap-icons), under names
// that say what they're for. Decorative by default (18px, aria-hidden): pair
// them with a text label or an IconButton `label`, which supplies the
// accessible name. Width/height/className props override the defaults.

import type { ComponentType } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Braces,
  ChatDots,
  CheckLg,
  ChevronDoubleRight,
  Clock,
  Gear,
  List,
  Robot,
  Stars,
  StopFill,
  Telephone,
  Wrench,
  XLg,
  type IconProps as BootstrapIconProps,
} from "react-bootstrap-icons";

export type IconProps = BootstrapIconProps;

/** A Bootstrap icon with the app's defaults. */
function appIcon(Glyph: ComponentType<BootstrapIconProps>, displayName: string) {
  function AppIcon(props: IconProps) {
    return <Glyph size={18} aria-hidden focusable={false} {...props} />;
  }
  AppIcon.displayName = displayName;
  return AppIcon;
}

/** Curly braces: the raw JSON view. */
export const BracesIcon = appIcon(Braces, "BracesIcon");
/** Sparkles: the AI copilot. */
export const SparklesIcon = appIcon(Stars, "SparklesIcon");
/** Arrow up: send a prompt. */
export const SendIcon = appIcon(ArrowUp, "SendIcon");
/** Square: stop what's running. */
export const StopIcon = appIcon(StopFill, "StopIcon");
/** Hamburger: opens the app menu. */
export const MenuIcon = appIcon(List, "MenuIcon");
/** Back. */
export const ArrowLeftIcon = appIcon(ArrowLeft, "ArrowLeftIcon");
/** Arrow right: opens something (an agent row). */
export const ArrowRightIcon = appIcon(ArrowRight, "ArrowRightIcon");
/** Telephone: a voice call (test call, the call log). */
export const PhoneIcon = appIcon(Telephone, "PhoneIcon");
/** A robot: an agent, e.g. in the menu's recent list. */
export const RobotIcon = appIcon(Robot, "RobotIcon");
/** Close a panel or dialog. */
export const CloseIcon = appIcon(XLg, "CloseIcon");
/** Gear: settings. */
export const SettingsIcon = appIcon(Gear, "SettingsIcon");
/** Double chevron: an agent action, the function that moves a call on. */
export const ActionIcon = appIcon(ChevronDoubleRight, "ActionIcon");
/** Speech bubble: a conversation, e.g. a call's transcript. */
export const ChatIcon = appIcon(ChatDots, "ChatIcon");
/** Check mark: done, completed. */
export const CheckIcon = appIcon(CheckLg, "CheckIcon");
/** Clock: a duration. */
export const ClockIcon = appIcon(Clock, "ClockIcon");
/** Wrench: fix something (with the copilot). */
export const FixIcon = appIcon(Wrench, "FixIcon");
