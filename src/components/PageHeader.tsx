import type { ReactNode } from "react";

export default function PageHeader({
  title,
  subtitle,
  icon,
  actions,
}: {
  title: string;
  subtitle?: string;
  icon: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div className="page-header-top">
        <div>
          <div className="page-title-group">
            {icon}
            <h1 className="page-title">{title}</h1>
          </div>
          {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
        </div>
        {actions ? <div className="header-actions">{actions}</div> : null}
      </div>
    </header>
  );
}
