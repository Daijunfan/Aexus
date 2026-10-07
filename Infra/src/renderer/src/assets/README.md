# Composable office and pets

There is no raster scene backdrop. UI.png remains a reference only.

Scene modules live in ../office/:
- OfficeCanvas.tsx: signed world coordinates, panning, pointer-centered zoom,
  culling and drag gestures.
- CanvasRoom.tsx: replaceable SVG boundary, decorations, label and workstations.
- Employee.tsx: fixed-size interactive workstation with live status badge.
- Mascot.tsx: independent vector body/head/eyes/arms/tail/ears/accessories.
- usePetBehavior.ts: asynchronous pose selection and interaction transitions.
- Furniture.tsx: independently replaceable interior objects.
- PolygonEditor.tsx: editable outline vertices.
- OfficeForms.tsx: root-folder, child-workspace, appearance and layout editors.

Choreography clips are in styles/pets.css. The business state still comes from
CLI session busy status; visual poses do not create simulated jobs. Character
movement respects reduced motion. Teams grow around fixed-size employees;
users control zoom and placement independently of the app window dimensions.
