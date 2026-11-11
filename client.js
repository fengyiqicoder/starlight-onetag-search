// Browser side of starlight-onetag-search.
import { addStyle, BASE_CSS, demoNote, el, errorText, pageText, pageTitle, stream } from './shared.js';

const STOP = new Set(('a an and are as at be by can could do does for from how i if in into is it its me my of on or ' +
	'our should site that the their there these this to use using we what when where which who why will with you your').split(' '));
function keywords(q) {
	const words = (q.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) || []).filter((w) => w.length > 1 && !STOP.has(w));
	const unique = [...new Set(words)].sort((a, b) => b.length - a.length).slice(0, 6);
	return unique.length ? unique : [q];
}

// Top pages for the question from the Pagefind index Starlight builds. Pagefind matches every
// word of a query, so keywords are searched one by one and pages ranked by how many they match.
async function retrieve(cfg, question) {
	try {
		const pf = await import(/* @vite-ignore */ cfg.base + 'pagefind/pagefind.js');
		await pf.init();
		const searches = await Promise.all(keywords(question).map((w) => pf.search(w)));
		const scores = new Map();
		searches.forEach((s) =>
			s.results.slice(0, 10).forEach((r, rank) => {
				const cur = scores.get(r.id) || { score: 0, result: r };
				cur.score += 1 + Math.max(0, 10 - rank) / 20 + (r.score || 0) / 100;
				scores.set(r.id, cur);
			})
		);
		const top = [...scores.values()].sort((a, b) => b.score - a.score).slice(0, cfg.topPages);
		const hits = await Promise.all(top.map((t) => t.result.data()));
		const pages = hits.map((h) => ({ title: h.meta?.title || h.url, url: h.url, text: (h.content || h.excerpt || '').slice(0, cfg.perPage) }));
		if (pages.length) return pages;
	} catch {}
	// No index (astro dev) or nothing matched: fall back to llms-full.txt, then the current page.
	for (const name of ['llms-full.txt', 'llms-small.txt']) {
		try {
			const r = await fetch(cfg.base + name);
			if (!r.ok) continue;
			const text = await r.text();
			if (text.length <= cfg.maxContext) return [{ title: 'All pages', url: cfg.base + name, text }];
		} catch {}
	}
	return [{ title: pageTitle(), url: location.pathname, text: pageText(cfg.perPage) }];
}

export default function init(cfg) {
	const host = document.getElementById('starlight__search');
	if (!host) return;
	addStyle('starlight-onetag-search', BASE_CSS + CSS);

	let controller = null;
	let asked = '';
	const label = el('span', { class: 'onetag-search-q' });
	const button = el('button', { type: 'button', class: 'onetag-search-ask', onclick: () => ask(current()) }, spark(), el('span', {}, cfg.label + ': '), label);
	const status = el('p', { class: 'onetag-status', 'aria-live': 'polite' });
	const answer = el('div', { class: 'onetag-answer' });
	const sources = el('p', { class: 'onetag-foot onetag-sources' });
	const result = el('div', { class: 'onetag-search-result', hidden: true }, status, answer, sources, demoNote(cfg));
	const box = el('div', { class: 'onetag-search', hidden: true, 'data-onetag-ui': '' }, button, result);

	const input = () => host.querySelector('.pagefind-ui__search-input');
	const current = () => (input()?.value || '').trim();

	function place() {
		const i = input();
		if (!i) return;
		const after = host.querySelector('.pagefind-ui__search-clear') || i;
		if (after.nextElementSibling !== box) after.after(box);
	}
	function update() {
		place();
		const q = current();
		box.hidden = q.length < cfg.minChars;
		label.textContent = '“' + q + '”';
		button.hidden = q === asked && !result.hidden;
		if (q !== asked) result.hidden = true;
	}

	new MutationObserver(() => {
		const i = input();
		if (i && !i.dataset.onetag) {
			i.dataset.onetag = '1';
			i.addEventListener('input', update);
		}
		place();
	}).observe(host, { childList: true, subtree: true });

	async function ask(q) {
		if (!q) return;
		controller?.abort();
		controller = new AbortController();
		const { signal } = controller;
		asked = q;
		button.hidden = true;
		result.hidden = false;
		answer.replaceChildren();
		sources.replaceChildren();
		status.classList.remove('error');
		status.textContent = 'Reading the docs…';
		try {
			const pages = await retrieve(cfg, q);
			let budget = cfg.maxContext;
			const parts = [];
			for (const p of pages) {
				const chunk = `Page: ${p.title} (${p.url})\n${p.text}`.slice(0, budget);
				if (!chunk) break;
				parts.push(chunk);
				budget -= chunk.length;
			}
			await stream(cfg, q + '\n\n(Reply in the same language as the question above.)', parts, answer, {
				system: cfg.rules,
				signal,
				onDelta: () => (status.textContent = ''),
			});
			if (signal.aborted) return;
			status.textContent = '';
			const real = pages.filter((p) => p.title !== 'All pages' && p.url !== location.pathname).slice(0, 3);
			if (real.length) {
				sources.append('From: ');
				real.forEach((p, i) => {
					if (i) sources.append(' · ');
					sources.append(el('a', { href: p.url }, p.title));
				});
			}
		} catch (e) {
			if (signal.aborted) return;
			status.textContent = errorText(e);
			status.classList.add('error');
		}
	}
}

function spark() {
	const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	s.setAttribute('width', '16');
	s.setAttribute('height', '16');
	s.setAttribute('viewBox', '0 0 24 24');
	s.setAttribute('aria-hidden', 'true');
	s.innerHTML = '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>';
	return s;
}

const CSS = `
.onetag-search { margin-top: 1rem; }
.onetag-search-ask { display: flex; align-items: center; gap: .5rem; width: 100%; text-align: start; font: inherit; font-size: var(--sl-text-base); padding: .75rem 1rem; border: 1px solid var(--sl-color-gray-5); border-radius: .4rem; background: var(--sl-color-black); color: var(--sl-color-white); cursor: pointer; }
.onetag-search-ask:hover, .onetag-search-ask:focus-visible { border-color: var(--sl-color-accent); outline: none; background: var(--sl-color-accent-low); }
.onetag-search-ask svg { color: var(--sl-color-text-accent); flex: none; }
.onetag-search-q { color: var(--sl-color-text-accent); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.onetag-search-result { padding: .75rem 1rem; border: 1px solid var(--sl-color-gray-5); border-inline-start: 3px solid var(--sl-color-accent); border-radius: .4rem; background: var(--sl-color-black); color: var(--sl-color-text); font-size: var(--sl-text-sm); }
.onetag-search-result a { color: var(--sl-color-text-accent); }
`;
