import { GreetingCard } from "../components/GreetingCard";

const visitors = [
  { slug: "ada", name: "Ada", tags: ["first visit", "designer"] },
  { slug: "grace", name: "Grace", tags: ["returning"] },
];

export function GreetingScreen() {
  return (
    <main className="mx-auto flex max-w-[var(--container-reading)] flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold text-[var(--foreground)]">Welcome</h1>

      {visitors.map((visitor) => (
        <a key={visitor.slug} href={`/v1/greeting/${visitor.slug}`}>
          <GreetingCard name={visitor.name} tags={visitor.tags} />
        </a>
      ))}

      <a className="text-sm text-[var(--muted-foreground)]" href="/v1/about">
        About this app
      </a>
    </main>
  );
}
