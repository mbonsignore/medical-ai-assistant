import { NavLink } from "react-router-dom";

type Props = {
  title: string;
  subtitle?: string;
  left?: React.ReactNode;
  right?: React.ReactNode;
  links?: Array<{ to: string; label: string }>;
};

export function Topbar({ title, subtitle, left, right, links }: Props) {
  return (
    <div className="topbar">
      <div className="topbar-left">
        {left}
        <div>
          <div className="topbar-title">{title}</div>
          {subtitle && <div className="small muted">{subtitle}</div>}
        </div>
      </div>

      {links && (
        <div className="topbar-links">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} className={({ isActive }) => (isActive ? "pill active" : "pill")}>
              {l.label}
            </NavLink>
          ))}
        </div>
      )}

      <div className="topbar-right">{right}</div>
    </div>
  );
}