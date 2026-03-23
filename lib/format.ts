const numberFormatter = new Intl.NumberFormat("en-US");
const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

export function formatCompact(value: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1
  }).format(value);
}

export function formatInteger(value: number): string {
  return numberFormatter.format(value);
}

export function formatPercent(value: number): string {
  return `${value.toFixed(value % 1 === 0 ? 0 : 1)}%`;
}

export function formatUnit(value: number, unit: string): string {
  if (!Number.isFinite(value)) {
    return String(value);
  }

  if (unit === "USD") {
    return currencyFormatter.format(value);
  }

  if (unit === "GBP") {
    return `GBP ${formatInteger(value)}`;
  }

  if (unit === "%" || unit === "%+" || unit === "percent") {
    return formatPercent(value);
  }

  if (unit === "ha") {
    return `${formatInteger(value)} ha`;
  }

  if (unit === "GBP_million") {
    return `GBP ${formatInteger(value)} million`;
  }

  if (unit === "USD_million") {
    return `${currencyFormatter.format(value)} million`;
  }

  if (!unit || unit === "mixed" || unit === "count") {
    return formatInteger(value);
  }

  return `${formatInteger(value)} ${unit}`;
}

export function sourceLabel(page: number): string {
  return `Source: p.${page}`;
}
