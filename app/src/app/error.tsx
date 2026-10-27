"use client";

export default function RouteError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert" className="card space-y-3">
      <h1 className="text-xl font-bold">Something went wrong</h1>
      <p className="text-sm text-muted">{error.message}</p>
      <button className="btn btn-primary" onClick={reset}>Try again</button>
    </div>
  );
}
