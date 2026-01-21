import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, ExternalLink } from "lucide-react";

export default function DisclaimerPage() {
  return (
    <div className="max-w-3xl mx-auto px-[3vw] py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-4">Disclaimer</h1>
        <p className="text-muted">
          Important information about this project and its relationship to
          Lenny&apos;s Podcast.
        </p>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Non-Commercial Use
            </CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none">
            <p>
              This project is a non-commercial, educational demonstration of
              AI-powered content exploration. It is not affiliated with,
              endorsed by, or officially connected to Lenny Rachitsky or
              Lenny&apos;s Podcast in any way.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Content Attribution</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none">
            <p>
              All podcast content, including transcripts, episode information,
              and quotes, belongs to Lenny Rachitsky and the respective guests
              of Lenny&apos;s Podcast.
            </p>
            <p>
              The transcripts used in this project are sourced from the
              publicly available{" "}
              <a
                href="https://github.com/ChatPRD/lennys-podcast-transcripts"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1"
              >
                lennys-podcast-transcripts repository
                <ExternalLink className="h-3 w-3" />
              </a>{" "}
              on GitHub.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Purpose</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none">
            <p>This project was created to:</p>
            <ul>
              <li>
                Demonstrate modern web development techniques with Next.js,
                Supabase, and AI integration
              </li>
              <li>
                Showcase RAG (Retrieval-Augmented Generation) for conversational
                search over long-form content
              </li>
              <li>
                Provide an example of building semantic search with vector
                embeddings
              </li>
              <li>
                Explore data visualization techniques for relationship mapping
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Accuracy</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none">
            <p>
              While we strive for accuracy, the AI-generated content on this
              site (including summaries, extracted quotes, and chat responses)
              may contain errors or misrepresentations. Always verify important
              information by listening to the original podcast episodes.
            </p>
            <p>
              For the official and authoritative source, please visit{" "}
              <a
                href="https://www.lennyspodcast.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1"
              >
                lennyspodcast.com
                <ExternalLink className="h-3 w-3" />
              </a>
              .
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contact</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none">
            <p>
              If you have concerns about this project or would like to request
              removal of any content, please open an issue on the project&apos;s
              GitHub repository or contact the maintainers directly.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-8 text-center">
        <Link
          href="/"
          className="text-muted hover:text-foreground underline text-sm"
        >
          &larr; Back to Home
        </Link>
      </div>
    </div>
  );
}
