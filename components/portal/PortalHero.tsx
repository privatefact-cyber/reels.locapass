import Link from "next/link";
import { sanitizeImageUrl } from "@/lib/utils/sanitize-image-url";
import { AutoplayVideo } from "@/components/portal/AutoplayVideo";

type Props = {
  name: string;
  tagline: string | null;
  description: string | null;
  heroMediaType: string;
  heroMediaUrl: string | null;
  heroLinkUrl: string | null;
};

export function PortalHero({ name, tagline, description, heroMediaType, heroMediaUrl, heroLinkUrl }: Props) {
  if (!heroMediaUrl && !tagline && !description) return null;
  return (
    <section data-surface="media" className="relative isolate min-h-[300px] overflow-hidden bg-page">
      {heroMediaUrl && (heroMediaType === "video" ? (
        <AutoplayVideo src={heroMediaUrl} />
      ) : (
        <img src={heroMediaUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ))}
      <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/45 to-black/20" />
      <div className="relative mx-auto flex min-h-[300px] max-w-[1400px] items-end px-6 py-10 md:px-14">
        <div className="max-w-2xl">
          <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.42em] text-accent">LOCAPASS PORTAL</p>
          <h1 className="text-3xl font-semibold tracking-wide text-main drop-shadow-lg md:text-5xl">{name}</h1>
          {tagline && <p className="mt-4 max-w-xl text-sm leading-7 text-main/80 md:text-base">{tagline}</p>}
          {description && <p className="mt-2 max-w-2xl text-xs leading-6 text-main/65 md:text-sm">{description}</p>}
          <Link href={heroLinkUrl || "#portal-feed"} className="mt-6 inline-flex border px-5 py-2.5 text-xs font-semibold tracking-[0.2em] border-accent text-main transition hover:bg-white hover:text-black">
            EXPLORE NOW
          </Link>
        </div>
      </div>
    </section>
  );
}
