# gallery-dl — Batch A

Files: `frontend/src/sites/gallery-dl/{GallerydlSite.tsx,Hero.tsx,Workspace.tsx,site.ts,gallery-dl.css}` and `frontend/src/tests/gallery-dlSite.test.tsx`.

Reference: Are.na. White ground, Source Serif 4 headings, quiet sans UI, generous space and matted archive frames. The API returns one ZIP, so frames represent actual archive downloads, without image thumbnails. The specified #8A8A8A appears in the large ZIP marker and accent; small secondary text uses #626262 to maintain readable contrast.

Measurements: hero/workspace at 1440×900, 768×1024 and 390×844: zero overflowing elements, no page overflow, no forbidden chrome. Missing-dependency Install bottoms were 873/900, 997/1024 and 819/844. Successful output also has zero overflow at all three sizes. Contrast: #202020/white 16.29:1; #626262/white 6.10:1; the 28px #8A8A8A ZIP marker/#FAFAFA 3.31:1. JSON measurements accompany the screenshots.

Availability: installed pip.gallery_dl 1.32.15 through the pinned browser control. The dependency gate now reports ready using the actual backend version.

Real failure: `real-run.json` records unsupported URL `http://example.com/gallery`, failed with no artifacts and `[gallery-dl][error] Unsupported URL 'http://example.com/gallery'`. Browser verification confirmed that message appears exactly once. The backend focused test test_gallery_dl_standalone passed: 1 passed, 7 deselected, one existing Starlette warning.

Real success: generated a 32×32 blue PNG with FFmpeg, served it locally on port 8765 and executed URL `http://localhost:8765/image.png`. `successful-run.json` records completed with a single gallery.zip artifact. The ZIP was 256 bytes, contained `localhost:8765__image.png`, passed zipfile.testzip(), and its image bytes had the PNG signature. See `archive-verification.json`. An exploratory URL with a directlink: prefix failed honestly; the ordinary HTTP image URL succeeded. The browser fetched the actual ZIP into a blob download, displayed its measured byte size, retained two separate downloads after two runs, and the download link was clicked. Changing URL displayed the stale-result warning.

Screenshot review: opened all six hero/empty workspace views, all three successful output views and the real failure view. Serif titles, generous margins and nested mats preserve the reference's quiet print-wall character. Phone output continues in the scrollable main area above the pinned action dock. Long actual paths wrap cleanly.

Verification: npm run verify passed: 139/139 tests, TypeScript passed, lint passed with 20 existing warnings. The tests check two hero actions, every actual manifest parameter, home navigation, absence of platform chrome, and a ZIP link without fabricated images. git diff --check passed before commit.

Limitations: the backend keeps a shared collection directory and overwrites gallery.zip. Its ZIP may include files left by earlier collections; the frontend does not claim the ZIP contains only the latest source. Individual filenames are flattened by the backend. Session blob snapshots preserve earlier downloaded bytes, but are lost on leaving/reloading and require browser memory. The UI warns users to save downloads before leaving. No backend or shared frontend source changes were made for this tool.
