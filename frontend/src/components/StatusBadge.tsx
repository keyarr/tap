interface Props {
  code: number;
}

const colors: Record<string, string> = {
  "2": "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  "3": "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  "4": "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  "5": "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

export default function StatusBadge({ code }: Props) {
  const prefix = String(code)[0];
  const cls = colors[prefix] ?? "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-semibold ${cls}`}>
      {code}
    </span>
  );
}
