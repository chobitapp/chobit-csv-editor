import { defineConfig } from "@cloudflare/config";

// The demo is a static single-page app served from Workers Static Assets.
// `@cloudflare/vite-plugin` reads this file from the Vite root (`demo/`) and writes the
// Build Output to `demo/.cloudflare/output`, which `cf deploy --prebuilt` uploads.
export default defineConfig({
	worker: {
		name: "chobit-csv-editor-demo",
		compatibilityDate: "2026-11-20",
		assets: { notFoundHandling: "single-page-application" },
	},
});
