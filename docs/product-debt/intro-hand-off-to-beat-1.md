# The intro ends with nowhere to go

**Created:** 2026-09-29
**Updated:** 2026-10-04, when Joe's punch became the intro's ending
**Module:** frontend / `apps/web/src/views/intro`

## What

The Chapter 1 intro ([script](../story/chapter-01-intro.md)) ends on card 10:
Module 2's music wakes Joe, he punches the screen, and it dies to black. Beat 1
is scripted to open in that dark, in Joe's room, with his line. Beat 1 does not
exist yet. The intro therefore ends holding on a black screen, and nothing
follows it.

## Why

The intro was built first because it is the game's first screen, and the
motif that later beats reuse starts in it. Beat 1 is a separate change: it is
the first adventure scene, and it needs a game mode that does not exist yet.

## Resolution

When beat 1 lands, it takes over from the intro's black: the room comes up out
of the dark, Joe beside the dead screen, and his line follows. That also
decides where beat 1 lives in the routes, and whether the intro keeps `/` or
moves behind a "new game" start.
