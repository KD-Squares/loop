Drop the official NDI logo in THIS folder as:

    ndi-logo.png

(A transparent-background PNG works best; any width is fine — it's shown ~28px tall.)

Once the file is here, the "Powered by NDI" badge across the app will use it
automatically. Until then, a drawn fallback mark is shown instead.

You can also use an .svg — if you do, save it as ndi-logo.png anyway, OR change
the src in web/src/components/brand/PoweredByNdi.tsx from "/ndi-logo.png" to
"/ndi-logo.svg".
