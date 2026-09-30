# The intro ends with nowhere to go

**Created:** 2026-09-29
**Module:** frontend / `apps/web/src/views/intro`

## What

The Chapter 1 intro ([script](../story/chapter-01-intro.md)) is scripted to
hand off to beat 1, where Joe slaps the orientation off mid-countdown. Beat 1
does not exist yet. The intro therefore ends holding on card 10's countdown at
"4…", with nothing to press and nowhere to go.

## Why

The intro was built first because it is the game's first screen, and the
motif that later beats reuse starts in it. Beat 1 is a separate change: it is
the first adventure scene, and it needs a game mode that does not exist yet.

## Resolution

When beat 1 lands, the intro's end state becomes its opening. The countdown
holds on "4…" behind Joe's room, and his line follows. That also decides where
beat 1 lives in the routes, and whether the intro keeps `/` or moves behind a
"new game" start.
