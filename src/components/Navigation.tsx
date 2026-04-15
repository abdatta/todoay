"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CheckSquare2, NotebookPen, Shapes, Settings } from "lucide-react";

const items = [
  { href: "/", label: "Tasks", icon: CheckSquare2 },
  { href: "/notes", label: "Notes", icon: NotebookPen },
  { href: "/misc", label: "Misc", icon: Shapes },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function Navigation() {
  const pathname = usePathname();

  return (
    <nav className="bottom-nav">
      <div className="nav-links">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href} className={`nav-link ${isActive ? "active" : ""}`}>
              <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
