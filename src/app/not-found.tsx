import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FileQuestion } from "lucide-react";

export default function NotFound() {
  return (
    <div className="max-w-content mx-auto px-[3vw] py-12">
      <div className="text-center py-16">
        <FileQuestion className="h-12 w-12 mx-auto text-muted mb-4" />
        <h2 className="text-2xl font-bold mb-2">Page not found</h2>
        <p className="text-muted mb-6 max-w-md mx-auto">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Button asChild>
          <Link href="/">Go back home</Link>
        </Button>
      </div>
    </div>
  );
}
