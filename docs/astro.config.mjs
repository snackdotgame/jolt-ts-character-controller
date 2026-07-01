// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// The demos only ever use the embedded single-thread `wasm-compat` build (loaded
// statically in src/lib/jolt.ts). But jolt-ts' loader references every build
// variant through `new URL(.., import.meta.url)`, so Vite emits all of them —
// including the ~25 MB debug builds. That loader path never runs here, so strip
// the unused variants from the final bundle.
function stripUnusedJoltBuilds() {
	const keep = /jolt-physics\.wasm-compat\.[\w-]+\.(js|mjs)$/;
	return {
		name: 'strip-unused-jolt-builds',
		apply: 'build',
		generateBundle(_options, bundle) {
			let removed = 0;
			let bytes = 0;
			for (const fileName of Object.keys(bundle)) {
				if (!/jolt-physics/.test(fileName)) continue;
				if (keep.test(fileName) && !/debug|multithread/.test(fileName)) continue;
				const chunk = bundle[fileName];
				const source = chunk.type === 'asset' ? chunk.source : chunk.code;
				bytes += typeof source === 'string' ? source.length : source?.byteLength ?? 0;
				delete bundle[fileName];
				removed += 1;
			}
			if (removed > 0) {
				this.info(`stripped ${removed} unused Jolt build artifact(s), ~${Math.round(bytes / 1e6)} MB`);
			}
		},
	};
}

// If you deploy under a sub-path (e.g. GitHub Pages), also set `base` here and
// point `site` at the full deployed URL so links, sitemap, and social cards
// resolve correctly.
// GitHub Pages project site: https://snackdotgame.github.io/jolt-ts-character-controller/
// `site` + `base` must match the repository name so internal links, assets, and
// the sitemap resolve under the /jolt-ts-character-controller/ path prefix.
// https://astro.build/config
export default defineConfig({
	site: 'https://snackdotgame.github.io',
	base: '/jolt-ts-character-controller/',
	trailingSlash: 'ignore',
	integrations: [
		starlight({
			title: 'jolt-ts-character-controller',
			description:
				'Imperative, rendering-free Ecctrl-style character, vehicle, and drone controllers for the jolt-ts physics wrapper.',
			customCss: ['./src/styles/demo.css'],
			social: [
				{
					icon: 'github',
					label: 'GitHub',
					href: 'https://github.com/snackdotgame/jolt-ts-character-controller',
				},
			],
			sidebar: [
				{
					label: 'Start Here',
					items: [
						{ label: 'Introduction', slug: 'getting-started/introduction' },
						{ label: 'Installation', slug: 'getting-started/installation' },
						{ label: 'Quick Start', slug: 'getting-started/quick-start' },
					],
				},
				{
					label: 'Character Controller',
					items: [
						{ label: 'Overview', slug: 'character-controller/overview' },
						{ label: 'Movement & Input', slug: 'character-controller/movement-and-input' },
						{ label: 'Configuration', slug: 'character-controller/configuration' },
						{ label: 'Reading State', slug: 'character-controller/reading-state' },
						{ label: 'Custom Gravity', slug: 'character-controller/custom-gravity' },
						{ label: 'Moving Platforms', slug: 'character-controller/moving-platforms' },
					],
				},
				{
					label: 'Animation',
					items: [
						{ label: 'Animation State Machine', slug: 'animation/state-machine' },
						{ label: 'Three.js Integration', slug: 'animation/three-integration' },
					],
				},
				{
					label: 'Vehicles',
					items: [
						{ label: 'Cars', slug: 'vehicles/cars' },
						{ label: 'Drones', slug: 'vehicles/drones' },
					],
				},
				{
					label: 'Advanced',
					items: [
						{ label: 'Network Sync', slug: 'advanced/network-sync' },
						{ label: 'Curves', slug: 'advanced/curves' },
						{ label: 'Bodies, Shapes & Layers', slug: 'advanced/bodies-and-layers' },
					],
				},
				{
					label: 'Examples',
					items: [
						{ label: 'Third-person (interactive)', slug: 'examples/third-person' },
						{ label: 'Character locomotion', slug: 'examples/character' },
						{ label: 'Slopes & steps', slug: 'examples/slopes' },
						{ label: 'Moving platform', slug: 'examples/moving-platform' },
						{ label: 'Planet gravity', slug: 'examples/planet-gravity' },
						{ label: 'Driving a car', slug: 'examples/car' },
						{ label: 'Flying a drone', slug: 'examples/drone' },
					],
				},
				{
					label: 'Reference',
					items: [{ label: 'API Reference', slug: 'reference/api' }],
				},
				{ label: 'Acknowledgements', slug: 'acknowledgements' },
			],
		}),
	],
	vite: {
		plugins: [stripUnusedJoltBuilds()],
		// The controller library is linked from the parent directory, and the
		// demos import it; allow Vite's dev server to read files above the docs root.
		server: { fs: { allow: ['..'] } },
	},
});
