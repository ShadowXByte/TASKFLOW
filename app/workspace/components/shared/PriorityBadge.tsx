interface PriorityBadgeProps {
  priority: "HIGH" | "MEDIUM" | "LOW";
  darkMode: boolean;
}

export function PriorityBadge({ priority, darkMode }: PriorityBadgeProps) {
  const className =
    priority === "HIGH"
      ? darkMode
        ? "bg-red-500/25 text-red-200"
        : "bg-red-100 text-red-700"
      : priority === "LOW"
      ? darkMode
        ? "bg-emerald-500/25 text-emerald-200"
        : "bg-emerald-100 text-emerald-700"
      : darkMode
      ? "bg-amber-500/25 text-amber-200"
      : "bg-amber-100 text-amber-700";

  return (
    <span className={`rounded px-2 py-0.5 text-xs font-semibold ${className}`}>
      {priority}
    </span>
  );
}
