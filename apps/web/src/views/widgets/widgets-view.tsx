import { Button } from "@my-app/design-system";

import { useWidgets } from "./use-widgets";

/**
 * The reference view: fetch through a hook, render the states a query actually
 * has. Deliberately plain — it is here to show the chain from the database to
 * the screen, not to demonstrate layout.
 *
 * The one piece of chrome it does have, the retry button, comes from the design
 * system rather than from a hand-rolled `<button>`. That is the rule for every
 * app primitive (see docs/frontend.apps.md), and it is the only thing in this
 * template that proves the design-system dependency resolves, typechecks and
 * renders.
 *
 * It passes no `variant`, deliberately. `pnpm run init` can point
 * `@my-app/design-system` at any design system this organisation publishes, and
 * their Button vocabularies do not overlap at all — uds is
 * `primary | secondary | tertiary`, base is `default | outline | ghost |
 * destructive`. There is no literal that compiles against both, so the only
 * portable call is the default one. See docs/tech-debt/design-systems-share-no-component-api.md.
 */
export function WidgetsView() {
  const { data, isPending, error, refetch, isFetching } = useWidgets();

  if (isPending) {
    return <p>Loading…</p>;
  }

  if (error) {
    return (
      <>
        <p role="alert">Could not load widgets: {error.message}</p>
        <Button onClick={() => void refetch()} disabled={isFetching}>
          Try again
        </Button>
      </>
    );
  }

  if (data.length === 0) {
    return <p>No widgets yet.</p>;
  }

  return (
    <main>
      <h1>Widgets</h1>
      <ul>
        {data.map((widget) => (
          <li key={widget.id}>{widget.name}</li>
        ))}
      </ul>
    </main>
  );
}
