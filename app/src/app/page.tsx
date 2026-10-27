import Link from "next/link";

export default function Home() {
  return (
    <div className="space-y-6">
      <h1 className="pixel text-3xl font-bold">FairShift</h1>
      <p className="max-w-2xl text-lg">
        Wage transparency, safety and grievance resolution for workers and employers, backed by one shared record.
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ["/worker", "Worker Dashboard", "Clock in, check hours, report a wage problem."],
          ["/employer", "Employer Dashboard", "Review reported cases and resolve them."],
          ["/simulation", "Live Workplace", "Watch the site and click workers to inspect them."],
        ].map(([href, title, body]) => (
          <Link key={href} href={href} className="card block hover:border-brand">
            <h2 className="text-lg font-bold">{title}</h2>
            <p className="text-muted">{body}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
