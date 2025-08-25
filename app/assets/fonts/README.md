
# Poppins local fonts

Place the Poppins font files in this folder with these exact names. WOFF2 is preferred but TTF is also supported and will work:

- Poppins-Regular.woff2  or Poppins-Regular.ttf  (400)
- Poppins-Medium.woff2   or Poppins-Medium.ttf   (500)
- Poppins-SemiBold.woff2 or Poppins-SemiBold.ttf (600)
- Poppins-Bold.woff2     or Poppins-Bold.ttf     (700)

Where to get them:

-- Visit the Poppins page on Google Fonts (search "Poppins Google Fonts"), select desired styles and download; then extract the .woff2 files.

Notes:

- The CSS in `app/src/styles/theme.css` expects these filenames and uses `@font-face` rules pointing to `/app/assets/fonts/*.woff2`.
- If your build copies assets to a different path, update the URLs in `theme.css` accordingly (or tell me the build output and I can adjust them).

Current files found in this folder (as of last check):

- Poppins-Regular.ttf
- Poppins-Medium.ttf
- Poppins-SemiBold.ttf
- Poppins-Bold.ttf
- Poppins.zip

If you want I can download the WOFF2 files and add them to this folder for you (tell me to proceed).
