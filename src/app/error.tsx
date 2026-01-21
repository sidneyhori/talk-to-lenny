"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="max-w-content mx-auto px-[3vw] py-12">
      <div className="text-center py-16">
        <AlertCircle className="h-12 w-12 mx-auto text-red-500 mb-4" />
        <h2 className="text-2xl font-bold mb-2">Something went wrong</h2>
        <p className="text-muted mb-6 max-w-md mx-auto">
          We encountered an error while loading this page. Please try again or
          contact support if the problem persists.
        </p>
        <Button onClick={reset}>Try again</Button>
      </div>
    </div>
  );
}
