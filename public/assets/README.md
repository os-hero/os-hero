# OS Hero Assets

The MVP renders the tray/menu bar character from layered pixel instructions in
`src/main/pixelRenderer.js` so frame generation stays deterministic on macOS and
Windows.

Future image assets can be added under this directory with this layout:

```text
assets/
  character/
    body/
      body_frame_01.png
      body_frame_02.png
      body_frame_03.png
      body_frame_04.png
    eyes/
      default.png
      dot.png
      happy.png
      sleepy.png
    clothes/
    head/
      basic_hair.png
      red_cap.png
      long_hair.png
      bob_hair.png
      twin_tails.png
    tools/
```

When replacing generated layers with PNG files, keep each source frame at a
small square pixel-art size such as 16x16 or 32x32 and render it with nearest
neighbor scaling before passing it to Electron's `Tray#setImage`.
