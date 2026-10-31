'use client';

export default function ErrorBoundary({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="grid max-w-xl gap-3 rounded border border-red-400 bg-red-50 p-4 text-sm text-red-950">
      <h2 className="font-display text-lg font-semibold">Something went wrong</h2>
      <p>The page could not be loaded. Nothing was sent. You can try again.</p>
      <button onClick={reset} className="w-fit rounded border border-stone-500 bg-white px-3 py-1.5">Try again</button>
    </div>
  );
}
