"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { MessageSquare, Grid3X3, Users, BookOpen, Quote, Menu, X } from "lucide-react";
import { useState } from "react";

const navigation = [
  { name: "Chat", href: "/chat", icon: MessageSquare },
  { name: "Podcasts", href: "/podcasts", icon: Grid3X3 },
  { name: "Guests", href: "/guests", icon: Users },
  { name: "Books", href: "/books", icon: BookOpen },
  { name: "Quotes", href: "/quotes", icon: Quote },
];

export function Header() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm shadow-sm">
      <div className="max-w-content mx-auto px-4 sm:px-6 lg:px-[3vw]">
        <div className="flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/images/lenny-fire-logo.webp"
              alt="Talk to Lenny logo"
              width={36}
              height={36}
              className="w-8 h-8 sm:w-9 sm:h-9"
            />
            <span className="font-handwriting text-2xl text-accent">Talk to Lenny</span>
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
                    "flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg transition-all duration-200",
                    isActive
                      ? "bg-accent text-white shadow-sm"
                      : "text-muted hover:text-foreground hover:bg-card-hover"
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
            className="md:hidden p-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
          >
            {mobileMenuOpen ? (
              <X className="h-6 w-6" />
            ) : (
              <Menu className="h-6 w-6" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile navigation - full screen overlay */}
      <div
        className={cn(
          "fixed inset-0 top-16 z-40 bg-background md:hidden transition-all duration-300 ease-in-out",
          mobileMenuOpen
            ? "opacity-100 translate-y-0"
            : "opacity-0 -translate-y-4 pointer-events-none"
        )}
      >
        <nav className="px-4 py-6">
          <div className="flex flex-col gap-2">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-4 py-4 text-lg font-medium rounded-xl transition-all duration-200 min-h-[56px]",
                    isActive
                      ? "bg-accent text-white shadow-sm"
                      : "text-foreground hover:bg-card-hover active:scale-[0.98]"
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {item.name}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </header>
  );
}
