import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-border mt-auto">
      <div className="max-w-content mx-auto px-[3vw] py-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="text-sm text-muted">
            <p>
              Built with data from{" "}
              <a
                href="https://www.lennyspodcast.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground"
              >
                Lenny&apos;s Podcast
              </a>
            </p>
          </div>
          <div className="flex items-center gap-6 text-sm">
            <Link href="/disclaimer" className="text-muted hover:text-foreground">
              Disclaimer
            </Link>
            <a
              href="https://github.com/ChatPRD/lennys-podcast-transcripts"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted hover:text-foreground"
            >
              Transcript Source
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
