export function EmptyState({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="empty-state">
      <div style={{ fontWeight: 800 }}>{title}</div>
      {subtitle && <div className="small muted">{subtitle}</div>}
    </div>
  );
}