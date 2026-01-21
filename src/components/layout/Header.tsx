"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { MessageSquare, Grid3X3, Users, BookOpen, Quote, Network, Menu, X } from "lucide-react";
import { useState } from "react";

const navigation = [
  { name: "Chat", href: "/chat", icon: MessageSquare },
  { name: "Podcasts", href: "/podcasts", icon: Grid3X3 },
  { name: "Guests", href: "/guests", icon: Users },
  { name: "Books", href: "/books", icon: BookOpen },
  { name: "Quotes", href: "/quotes", icon: Quote },
  { name: "Graph", href: "/graph", icon: Network },
];

export function Header() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-background border-b border-border">
      <div className="max-w-content mx-auto px-[3vw]">
        <div className="flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-xl font-semibold">Talk to Lenny</span>
          </Link>

          {/* Desktop navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors",
                    isActive
                      ? "bg-accent text-white"
                      : "text-muted hover:text-foreground hover:bg-card"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.name}
                </Link>
              );
            })}
          </nav>

          {/* Mobile menu button */}
          <button
            className="md:hidden p-2"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? (
              <X className="h-6 w-6" />
            ) : (
              <Menu className="h-6 w-6" />
            )}
          </button>
        </div>

        {/* Mobile navigation */}
        {mobileMenuOpen && (
          <nav className="md:hidden py-4 border-t border-border">
            <div className="flex flex-col gap-1">
              {navigation.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors",
                      isActive
                        ? "bg-accent text-white"
                        : "text-muted hover:text-foreground hover:bg-card"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.name}
                  </Link>
                );
              })}
            </div>
          </nav>
        )}
      </div>
    </header>
  );
}
