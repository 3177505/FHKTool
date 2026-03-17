# Bertin Variable Font Explorer

Vite + p5.js setup. Hot reload on save, ready for p5 sketches.

## Setup

```bash
npm install
```

## Run (with auto-refresh)

```bash
npm run dev
```

Opens http://localhost:5173 – edits refresh instantly.

## Add p5.js

p5 is already installed. Use it like this:

```js
import p5 from "p5";

new p5((sketch) => {
  sketch.setup = () => {
    sketch.createCanvas(400, 300);
  };
  sketch.draw = () => {
    sketch.background(220);
    sketch.textSize(48);
    sketch.text("Hello", 100, 150);
  };
}, document.getElementById("p5-container"));
```

See `src/p5-example.js` for a Bertin font example.

## Build

```bash
npm run build
```

Output in `dist/`. Deploy that folder.
