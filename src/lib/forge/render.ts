import chalk from "chalk";
import type { PrChecks, PrDisplay, PrDisplayState } from "./types.js";

const STATE_COLORS: Record<PrDisplayState, (text: string) => string> = {
  MERGED: chalk.green,
  CLOSED: chalk.dim,
  DRAFT: chalk.yellow,
  CONFLICTED: chalk.red,
  CI_FAILING: chalk.red,
  CHANGES_REQUESTED: chalk.red,
  CI_RUNNING: chalk.yellow,
  IN_REVIEW: chalk.yellow,
  APPROVED: chalk.green,
  AWAITING_REVIEW: chalk.dim,
};

export function renderDisplayState(display: PrDisplay): string {
  let text = STATE_COLORS[display.primary](display.primary);

  if (display.approved) {
    text += ` ${chalk.green("· APPROVED")}`;
  }

  if (display.awaitingReview) {
    text += ` ${chalk.dim("· awaiting review")}`;
  }

  return text;
}

export function renderChecksSummary(checks: PrChecks): string | null {
  if (checks.total === 0) return null;

  const icon =
    checks.failed > 0 ? chalk.red("✗") : checks.pending > 0 ? chalk.cyan("◌") : chalk.green("✓");

  return `checks ${checks.passed}/${checks.total} ${icon}`;
}

export function formatRelativeTime(isoTimestamp: string): string {
  const timestamp = Date.parse(isoTimestamp);
  if (Number.isNaN(timestamp)) return "";

  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60000));
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  return `${Math.round(hours / 24)}d ago`;
}
