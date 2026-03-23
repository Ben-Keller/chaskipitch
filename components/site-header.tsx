"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Home / Global Impact" },
  { href: "/countries", label: "Country Explorer" },
  { href: "/thematics", label: "Thematics" },
  { href: "/financials", label: "Financials" },
  { href: "/about", label: "About / Method" }
];

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="site-header" role="banner">
      <div className="site-header__inner">
        <Link href="/" className="brand" aria-label="Tenure Facility Annual Report 2024 home">
          <span className="brand__eyebrow">Tenure Facility</span>
          <span className="brand__title">Annual Report 2024 Platform</span>
        </Link>
        <nav aria-label="Primary">
          <ul className="main-nav">
            {links.map((link) => {
              const active = pathname === link.href || (link.href !== "/" && pathname.startsWith(link.href));
              return (
                <li key={link.href}>
                  <Link href={link.href} className={active ? "active" : undefined}>
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </header>
  );
}
