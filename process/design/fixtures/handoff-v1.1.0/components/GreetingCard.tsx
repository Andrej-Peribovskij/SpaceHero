import { Chip } from "./Chip";
import { icons } from "../icons";

/** The new one: a greeting with a presence dot and the visitor's tags. */
export function GreetingCard({ name, tags }: { name: string; tags: string[] }) {
  const Wave = icons.wave;

  return (
    <article
      className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--border)]
        bg-[var(--card)] p-4 text-[var(--card-foreground)]"
    >
      <header className="flex items-center gap-2">
        <Wave className="size-5 text-[var(--primary)]" aria-hidden />
        <h2 className="text-base font-semibold">Hello, {name}</h2>
        <span
          className="ml-auto size-2 rounded-[var(--radius-full)] bg-[var(--success)]"
          aria-label="online"
        />
      </header>

      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <Chip key={tag} label={tag} />
        ))}
      </div>
    </article>
  );
}
