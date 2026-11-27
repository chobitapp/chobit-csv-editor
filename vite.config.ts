import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [react()],
	build: {
		lib: {
			entry: "src/index.ts",
			formats: ["es"],
			fileName: "index",
		},
		rolldownOptions: {
			external: [/^react($|\/)/, /^react-dom($|\/)/, /^@tanstack\//, "papaparse", "encoding-japanese"],
		},
	},
	test: {
		environment: "jsdom",
		globals: true,
		setupFiles: ["./vitest.setup.ts"],
		include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.ts"],
	},
});
