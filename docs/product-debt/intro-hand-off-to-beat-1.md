# The intro ends with nowhere to go

**Created:** 2026-09-29
**Module:** frontend / `apps/web/src/views/intro`

## What

The Chapter 1 intro ([script](../story/chapter-01-intro.md)) is scripted to
hand off to beat 1, where Joe answers Module 2's **PRESS ANY KEY TO CONTINUE
ORIENTATION** by slapping the screen off. Beat 1 does not exist yet. The intro
therefore ends holding on Module 2's ident: its prompt asks for a key, and
nothing answers it.

## Why

The intro was built first because it is the game's first screen, and the
motif that later beats reuse starts in it. Beat 1 is a separate change: it is
the first adventure scene, and it needs a game mode that does not exist yet.

## Resolution

When beat 1 lands, the intro's end state becomes its opening: Module 2's
ident waits on the screen in Joe's room, a key press is his slap, and his line
follows. That also decides where beat 1 lives in the routes, and whether the
intro keeps `/` or moves behind a "new game" start.
