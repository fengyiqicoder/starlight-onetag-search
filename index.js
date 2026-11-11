/**
 * starlight-onetag-search: an "Ask AI" answer inside Starlight's search dialog, above the Pagefind results.
 *
 *   import starlightOnetagSearch from "starlight-onetag-search";
 *   starlight({ plugins: [starlightOnetagSearch()] })
 */
import { makePlugin } from './plugin.js';

export default function starlightOnetagSearch(options = {}) {
	return makePlugin(
		'starlight-onetag-search',
		{
			key: options.key ?? '',
			site: options.site ?? 'https://onetagai.com',
			label: options.label ?? 'Ask AI',
			minChars: options.minChars ?? 3,
			rules:
				options.rules ??
				'You answer questions typed into the search box of a documentation site. Answer only from the pages provided. When they cover the question, answer it directly in under 120 words and stop. When they do not, say so in one sentence and name the closest page. Plain text, no headings. Answer in the language of the question.',
			topPages: options.topPages ?? 5,
			perPage: options.perPage ?? 5000,
			maxContext: options.maxContext ?? 20000,
			maxTokens: options.maxTokens ?? 400,
		},
		'AI search answers'
	);
}
