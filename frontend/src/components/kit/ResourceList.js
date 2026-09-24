import { hostLabel } from "@/lib/format";

/**
 * Things to watch and read, as rows.
 *
 * Every one is a real search result — found by searching for the role, one category at
 * a time — so the list is short, honest, and empty when nothing was found. A video
 * carries its thumbnail because that is what makes it recognisable at a glance; an
 * article does not, because a screenshot of an article is noise.
 *
 * Rows, not cards, and no tags: the heading above already says which category this is,
 * and the day already says which day. The only thing each row has to add is what it is
 * and who made it.
 *
 * @param {object[]} resources
 * @param {boolean} dense  the schedule-day variant: smaller thumbnail, tighter rows
 */
export default function ResourceList({ resources, dense = false }) {
  if (!resources?.length) return null;

  return (
    <ul className="divide-y divide-ink/[0.07]">
      {resources.map((resource) => (
        <li key={resource.id}>
          <a
            href={resource.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`group flex items-center gap-3 rounded-xl transition-colors duration-200
                        hover:bg-ink/[0.03] focus-visible:outline-none focus-visible:ring-2
                        focus-visible:ring-accent focus-visible:ring-offset-2 ${
                          dense ? "px-2 py-2" : "px-2 py-3"
                        }`}
          >
            {resource.kind === "video" && resource.thumbnail ? (
              <Thumbnail src={resource.thumbnail} dense={dense} />
            ) : null}

            <span className="min-w-0 flex-1">
              <span
                className={`block font-medium leading-[1.4] text-ink
                            group-hover:text-accent ${dense ? "text-sm" : "text-[15px]"}`}
              >
                {resource.title}
              </span>
              <span className="mt-0.5 block text-sm font-medium text-ink/50">
                {resource.source || hostLabel(resource.url)}
                {resource.kind === "video" && " · video"}
                <span className="sr-only"> (opens in a new tab)</span>
              </span>
            </span>

            <ExternalGlyph />
          </a>
        </li>
      ))}
    </ul>
  );
}

/**
 * A plain <img>, deliberately: next/image would want img.youtube.com and i.ytimg.com in
 * next.config.mjs and would route every thumbnail through the optimiser running in the
 * single instance that also serves the API.
 *
 * YouTube serves hqdefault for every video, but a deleted one 404s — in which case the
 * image removes itself and the row reads as an article, rather than leaving a grey box.
 */
function Thumbnail({ src, dense }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- see the note above
    <img
      src={src}
      alt=""
      loading="lazy"
      width={dense ? 72 : 104}
      height={dense ? 40 : 58}
      onError={(event) => {
        event.currentTarget.style.display = "none";
      }}
      className={`aspect-[16/9] shrink-0 rounded-lg bg-ink/[0.06] object-cover ${
        dense ? "w-[72px]" : "w-[104px]"
      }`}
    />
  );
}

function ExternalGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="size-4 shrink-0 text-ink/25 transition-colors duration-200 group-hover:text-accent"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 15L20 4M20 4h-6M20 4v6M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" />
    </svg>
  );
}
