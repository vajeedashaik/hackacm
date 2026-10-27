import Link from "next/link";

export default function NotFound() {
  return (
    <div className="card space-y-3">
      <h1 className="text-xl font-bold">Page not found</h1>
      <Link href="/" className="btn btn-primary">Go home</Link>
    </div>
  );
}
