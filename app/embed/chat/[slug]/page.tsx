"use client";

import { useSearchParams, useParams } from "next/navigation";
import FloatingAssistant from "@/components/ai/FloatingAssistant";

export default function ChatEmbedPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = params.slug as string;

  // Customization via query params
  const title = searchParams.get("title") || undefined;
  const greeting = searchParams.get("greeting") || undefined;
  const themeColor = searchParams.get("color") || undefined;

  return (
    <div className="w-screen h-screen bg-transparent flex flex-col">
      <FloatingAssistant 
        isEmbed={true}
        storeSlug={slug}
        title={title}
        greeting={greeting}
        themeColor={themeColor ? `#${themeColor}` : undefined}
      />
    </div>
  );
}
