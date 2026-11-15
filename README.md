# glitch_type

A neon, glitch-themed typing trainer with arcade game modes. No login, no database: everything runs in your browser and your progress is saved locally.

## Modes

- **Black Hole**: letter and word asteroids pour out of a black hole. Type them to shoot them down. Play the Campaign (20 levels) or Endless survival.
- **Repair Protocol**: a transmission has been corrupted. Type the words to repair it before the corruption reaches 100% (Survival), or against the clock (Timed).
- **Daily Challenge**: the same seeded round for everyone, every day.
- **Lessons**: row-by-row drills with an on-screen finger guide.
- **Stats**: WPM history, personal bests, a weak-key heatmap and achievements.

Pick a mode with the **claw machine** on the start screen: steer with the arrow keys, press Space to drop, type a crate label, or just click a crate.

Words and passages are available in **English** and **Bahasa Indonesia**.

## Development

```bash
npm install
npm run dev      # start dev server
npm run build    # type-check + production build into dist/
```

Built with Vite + TypeScript (no framework), Canvas 2D, Web Audio and [matter-js](https://brm.io/matter-js/) for the claw machine physics.
